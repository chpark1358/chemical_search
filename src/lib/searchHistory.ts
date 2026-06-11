/**
 * 최근 검색 기록(localStorage). 성공한 검색(done/partial)마다 한 건씩 쌓고,
 * 정규화한 검색어 기준으로 중복을 제거(최신 유지)하며 최대 20건까지 보관한다.
 *
 * SSR 안전: 모든 접근은 typeof window 가드를 거치며, 서버에서는 빈 배열을 반환한다.
 */

const STORAGE_KEY = "chem.history.v1";
const MAX_ENTRIES = 20;

export interface SearchHistoryEntry {
  /** 사용자가 입력한 원본 검색어(트림됨). */
  query: string;
  /** 확인된 화합물명(없으면 null). */
  compoundName: string | null;
  /** 확인된 InChIKey(없으면 null) — "이미 검색함" 판별에 사용. */
  inchiKey: string | null;
  /** PubChem CID(없으면 null). */
  cid: number | null;
  paperCount: number;
  patentCount: number;
  /** 기록 시각(epoch ms). */
  ts: number;
}

/** 중복 제거 키: 대소문자/양끝 공백/연속 공백을 정규화한 검색어. */
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function isEntry(value: unknown): value is SearchHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.query === "string" &&
    (entry.compoundName === null || typeof entry.compoundName === "string") &&
    (entry.inchiKey === null || typeof entry.inchiKey === "string") &&
    (entry.cid === null || typeof entry.cid === "number") &&
    typeof entry.paperCount === "number" &&
    typeof entry.patentCount === "number" &&
    typeof entry.ts === "number"
  );
}

function read(): SearchHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}

function write(entries: SearchHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 저장 실패(용량 초과/프라이빗 모드)는 조용히 무시한다.
  }
  emit();
}

// 동일 탭 구독 채널 + storage 이벤트(다른 탭). useSyncExternalStore로 SSR 안전하게 구독한다.
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** 변경 구독. 반환값으로 구독 해제. */
export function subscribeHistory(listener: () => void): () => void {
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

// useSyncExternalStore는 안정된 스냅샷 참조를 요구한다(매 호출 새 배열이면 무한 루프).
// 마지막으로 직렬화한 결과를 캐시해, 내용이 같으면 동일 참조를 돌려준다.
let cachedSnapshot: SearchHistoryEntry[] = [];
let cachedRaw = "__init__";

/** 정렬된 최신 기록의 캐시된 스냅샷(useSyncExternalStore용). */
export function getHistorySnapshot(): SearchHistoryEntry[] {
  if (typeof window === "undefined") return EMPTY_HISTORY;
  const raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = listHistory();
  return cachedSnapshot;
}

/** 서버 스냅샷(항상 동일 참조의 빈 배열). */
const EMPTY_HISTORY: SearchHistoryEntry[] = [];

export function getServerHistorySnapshot(): SearchHistoryEntry[] {
  return EMPTY_HISTORY;
}

/** 최신순 정렬된 기록 목록(최신이 앞). */
export function listHistory(): SearchHistoryEntry[] {
  return read().sort((a, b) => b.ts - a.ts);
}

/**
 * 검색 기록을 추가한다. 같은(정규화된) 검색어가 있으면 제거 후 최신으로 다시 추가하고,
 * 최대 MAX_ENTRIES 건만 남긴다.
 */
export function addHistory(entry: Omit<SearchHistoryEntry, "ts">): SearchHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const query = entry.query.trim();
  if (!query) return listHistory();
  const key = normalizeQuery(query);
  const next: SearchHistoryEntry = { ...entry, query, ts: Date.now() };
  const deduped = read().filter((item) => normalizeQuery(item.query) !== key);
  deduped.push(next);
  const trimmed = deduped.sort((a, b) => b.ts - a.ts).slice(0, MAX_ENTRIES);
  write(trimmed);
  return trimmed;
}

/** 단일 기록 삭제(정규화된 검색어 기준). */
export function removeHistory(query: string): SearchHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const key = normalizeQuery(query);
  const next = read().filter((item) => normalizeQuery(item.query) !== key);
  write(next);
  return next.sort((a, b) => b.ts - a.ts);
}

/** 모든 기록 삭제. */
export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시.
  }
  emit();
}
