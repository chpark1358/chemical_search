/**
 * 저장됨(즐겨찾기) 라이브러리(localStorage). 논문/특허를 스냅샷째로 저장해
 * 재검색 없이도 렌더할 수 있게 한다. 사용자 편집(커스텀 제목/메모/태그)을 지원한다.
 *
 * SSR 안전: 모든 접근은 typeof window 가드를 거친다. 서버에서는 빈 목록을 반환한다.
 * 동기화: 모듈 레벨 이벤트 이미터 + storage 이벤트로 탭 내/탭 간 구독자에게 변경을 알린다.
 */

import type { Paper, Patent } from "./api";
import { paperKey, patentKey } from "./papers";

const STORAGE_KEY = "chem.saved.v1";

export type SavedKind = "paper" | "patent";

export interface SavedItem {
  /** 안정 키(paper: doi||id / patent: publication_number||id). 컬렉션 내 고유. */
  key: string;
  kind: SavedKind;
  /** 원본 제목(스냅샷 당시). */
  title: string;
  /** 사용자가 편집한 표시 제목(선택). 비어 있으면 원본 title을 쓴다. */
  customTitle?: string;
  /** 자유 메모. */
  memo: string;
  /** 태그 목록. */
  tags: string[];
  /** 재렌더용 원본 스냅샷. */
  data: Paper | Patent;
  /** 저장 당시 검색했던 화합물명(없으면 null). */
  compoundName: string | null;
  /** 저장 시각(epoch ms). */
  savedAt: number;
}

/** 논문 저장 항목인지 좁히는 타입 가드. */
export function isSavedPaper(
  item: SavedItem
): item is SavedItem & { kind: "paper"; data: Paper } {
  return item.kind === "paper";
}

/** 특허 저장 항목인지 좁히는 타입 가드. */
export function isSavedPatent(
  item: SavedItem
): item is SavedItem & { kind: "patent"; data: Patent } {
  return item.kind === "patent";
}

function isSavedItem(value: unknown): value is SavedItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.key === "string" &&
    (item.kind === "paper" || item.kind === "patent") &&
    typeof item.title === "string" &&
    typeof item.memo === "string" &&
    Array.isArray(item.tags) &&
    item.tags.every((tag) => typeof tag === "string") &&
    typeof item.savedAt === "number" &&
    item.data !== null &&
    typeof item.data === "object"
  );
}

function read(): SavedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedItem);
  } catch {
    return [];
  }
}

function write(items: SavedItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // 저장 실패는 조용히 무시한다.
  }
  emit();
}

// useSyncExternalStore는 안정된 스냅샷 참조를 요구한다(매 호출 새 배열이면 무한 루프).
// 마지막으로 직렬화한 결과를 캐시해, 내용이 같으면 동일 참조를 돌려준다.
let cachedSnapshot: SavedItem[] = [];
let cachedRaw = "__init__";

/** 정렬된 저장 목록의 캐시된 스냅샷(useSyncExternalStore용). */
export function getSavedSnapshot(): SavedItem[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  const raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = listSaved();
  return cachedSnapshot;
}

/** 서버 스냅샷(항상 동일 참조의 빈 배열). */
const SERVER_SNAPSHOT: SavedItem[] = [];

export function getServerSavedSnapshot(): SavedItem[] {
  return SERVER_SNAPSHOT;
}

// 같은 탭 안의 구독자에게 변경을 알리는 간단한 이미터. storage 이벤트는 다른 탭에서만
// 발생하므로, 동일 탭 동기화를 위해 별도의 구독 채널을 둔다.
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** 변경 구독. 반환값으로 구독 해제. storage 이벤트(다른 탭)도 함께 전달한다. */
export function subscribeSaved(listener: () => void): () => void {
  listeners.add(listener);
  let onStorage: ((event: StorageEvent) => void) | null = null;
  if (typeof window !== "undefined") {
    onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) listener();
    };
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (onStorage && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

/** 안정 키 계산(저장 항목의 고유 식별자). */
export function savedKeyForPaper(paper: Paper): string {
  return paperKey(paper);
}

export function savedKeyForPatent(patent: Patent): string {
  return patentKey(patent);
}

/** 저장 목록(최신 저장이 앞). */
export function listSaved(): SavedItem[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

/** 해당 키가 저장돼 있는지. */
export function hasSaved(key: string): boolean {
  return read().some((item) => item.key === key);
}

/** 논문을 저장한다(이미 있으면 그대로 둔다). */
export function addPaper(paper: Paper, compoundName: string | null): SavedItem[] {
  if (typeof window === "undefined") return [];
  const key = savedKeyForPaper(paper);
  const items = read();
  if (items.some((item) => item.key === key)) return listSaved();
  const next: SavedItem = {
    key,
    kind: "paper",
    title: paper.title,
    memo: "",
    tags: [],
    data: paper,
    compoundName,
    savedAt: Date.now()
  };
  items.push(next);
  write(items);
  return items.sort((a, b) => b.savedAt - a.savedAt);
}

/** 특허를 저장한다(이미 있으면 그대로 둔다). */
export function addPatent(patent: Patent, compoundName: string | null): SavedItem[] {
  if (typeof window === "undefined") return [];
  const key = savedKeyForPatent(patent);
  const items = read();
  if (items.some((item) => item.key === key)) return listSaved();
  const next: SavedItem = {
    key,
    kind: "patent",
    title: patent.title,
    memo: "",
    tags: [],
    data: patent,
    compoundName,
    savedAt: Date.now()
  };
  items.push(next);
  write(items);
  return items.sort((a, b) => b.savedAt - a.savedAt);
}

/** 저장 항목 제거(키 기준). */
export function removeSaved(key: string): SavedItem[] {
  if (typeof window === "undefined") return [];
  const next = read().filter((item) => item.key !== key);
  write(next);
  return next.sort((a, b) => b.savedAt - a.savedAt);
}

/** 편집 가능한 필드만 부분 갱신한다(customTitle/memo/tags). */
export type SavedItemPatch = Partial<Pick<SavedItem, "customTitle" | "memo" | "tags">>;

export function updateSaved(key: string, patch: SavedItemPatch): SavedItem[] {
  if (typeof window === "undefined") return [];
  const items = read().map((item) =>
    item.key === key ? { ...item, ...patch } : item
  );
  write(items);
  return items.sort((a, b) => b.savedAt - a.savedAt);
}

/** 전체 비우기. */
export function clearSaved(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시.
  }
  emit();
}
