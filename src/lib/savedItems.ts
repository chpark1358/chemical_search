/**
 * 저장됨(즐겨찾기) 라이브러리 — Supabase saved_items 테이블 백엔드(사용자별).
 *
 * 데이터는 로그인한 사용자에게 RLS로 스코프된다(브라우저 클라이언트의 세션 쿠키가
 * auth.uid()를 결정). 앱은 로그인 게이트 뒤에서만 동작하므로 비로그인 폴백은 없다.
 *
 * 동기화 모델: 모듈 레벨 스토어 + useSyncExternalStore. 첫 구독 시 1회 fetch하여
 * 캐시하고, 이후 변경(추가/삭제/수정)은 로컬 캐시를 낙관적으로 갱신한 뒤 Supabase에
 * 비동기로 반영한다. 실패하면 서버 상태로 되돌린다(refresh). 안정된 스냅샷 참조를
 * 유지해 useSyncExternalStore 무한 루프를 피한다.
 */

import type { Paper, Patent } from "./api";
import { paperKey, patentKey } from "./papers";
import { createClient } from "./supabase/client";

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

/** Supabase saved_items 행 모양(snake_case). */
interface SavedRow {
  item_key: string;
  kind: SavedKind;
  title: string;
  custom_title: string | null;
  memo: string | null;
  tags: string[] | null;
  data: Paper | Patent;
  compound_name: string | null;
  saved_at: string;
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

/** 안정 키 계산(저장 항목의 고유 식별자). */
export function savedKeyForPaper(paper: Paper): string {
  return paperKey(paper);
}

export function savedKeyForPatent(patent: Patent): string {
  return patentKey(patent);
}

function rowToItem(row: SavedRow): SavedItem {
  return {
    key: row.item_key,
    kind: row.kind,
    title: row.title,
    customTitle: row.custom_title ?? undefined,
    memo: row.memo ?? "",
    tags: row.tags ?? [],
    data: row.data,
    compoundName: row.compound_name,
    savedAt: new Date(row.saved_at).getTime()
  };
}

// ── 모듈 레벨 스토어 ─────────────────────────────────────────────────────────

const EMPTY: SavedItem[] = [];
let snapshot: SavedItem[] = EMPTY;
let loaded = false;
let loading = false;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setSnapshot(next: SavedItem[]): void {
  snapshot = next.slice().sort((a, b) => b.savedAt - a.savedAt);
  emit();
}

/** 서버에서 최신 목록을 가져와 캐시를 교체한다. */
async function load(): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("saved_items")
      .select(
        "item_key, kind, title, custom_title, memo, tags, data, compound_name, saved_at"
      )
      .order("saved_at", { ascending: false });
    if (!error && data) {
      setSnapshot((data as SavedRow[]).map(rowToItem));
    }
  } catch {
    // 네트워크 오류는 조용히 무시하고 기존 캐시를 유지한다.
  } finally {
    loaded = true;
    loading = false;
  }
}

/** 강제 재조회(외부에서 동기화가 필요할 때). */
export function refreshSaved(): void {
  void load();
}

/** 변경 구독. 첫 구독 시 1회 fetch한다. 반환값으로 구독 해제. */
export function subscribeSaved(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded && !loading) void load();
  return () => {
    listeners.delete(listener);
  };
}

/** 캐시된 스냅샷(useSyncExternalStore용, 안정 참조). */
export function getSavedSnapshot(): SavedItem[] {
  return snapshot;
}

/** 서버 스냅샷(항상 동일 참조의 빈 배열). */
export function getServerSavedSnapshot(): SavedItem[] {
  return EMPTY;
}

/** 저장 목록(최신 저장이 앞). */
export function listSaved(): SavedItem[] {
  return snapshot;
}

/** 해당 키가 (캐시상) 저장돼 있는지. */
export function hasSaved(key: string): boolean {
  return snapshot.some((item) => item.key === key);
}

// ── 변경(낙관적 갱신 + Supabase 반영) ────────────────────────────────────────

function buildPaperItem(paper: Paper, compoundName: string | null): SavedItem {
  return {
    key: savedKeyForPaper(paper),
    kind: "paper",
    title: paper.title,
    memo: "",
    tags: [],
    data: paper,
    compoundName,
    savedAt: Date.now()
  };
}

function buildPatentItem(patent: Patent, compoundName: string | null): SavedItem {
  return {
    key: savedKeyForPatent(patent),
    kind: "patent",
    title: patent.title,
    memo: "",
    tags: [],
    data: patent,
    compoundName,
    savedAt: Date.now()
  };
}

async function upsertRow(item: SavedItem): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("saved_items").upsert(
      {
        user_id: user.id,
        item_key: item.key,
        kind: item.kind,
        title: item.title,
        custom_title: item.customTitle ?? null,
        memo: item.memo,
        tags: item.tags,
        data: item.data,
        compound_name: item.compoundName
      },
      { onConflict: "user_id,item_key" }
    );
    if (error) void load();
  } catch {
    void load();
  }
}

/** 논문을 저장한다(이미 있으면 그대로 둔다). 낙관적으로 캐시에 추가 후 upsert. */
export function addPaper(paper: Paper, compoundName: string | null): void {
  const key = savedKeyForPaper(paper);
  if (snapshot.some((item) => item.key === key)) return;
  const item = buildPaperItem(paper, compoundName);
  setSnapshot([item, ...snapshot]);
  void upsertRow(item);
}

/** 특허를 저장한다(이미 있으면 그대로 둔다). */
export function addPatent(patent: Patent, compoundName: string | null): void {
  const key = savedKeyForPatent(patent);
  if (snapshot.some((item) => item.key === key)) return;
  const item = buildPatentItem(patent, compoundName);
  setSnapshot([item, ...snapshot]);
  void upsertRow(item);
}

/** 저장 항목 제거(키 기준). 낙관적으로 캐시에서 제거 후 삭제. */
export function removeSaved(key: string): void {
  const existed = snapshot.some((item) => item.key === key);
  if (!existed) return;
  setSnapshot(snapshot.filter((item) => item.key !== key));
  void (async () => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("saved_items")
        .delete()
        .eq("item_key", key);
      if (error) void load();
    } catch {
      void load();
    }
  })();
}

/** 편집 가능한 필드만 부분 갱신한다(customTitle/memo/tags). */
export type SavedItemPatch = Partial<Pick<SavedItem, "customTitle" | "memo" | "tags">>;

export function updateSaved(key: string, patch: SavedItemPatch): void {
  const target = snapshot.find((item) => item.key === key);
  if (!target) return;
  const merged: SavedItem = { ...target, ...patch };
  setSnapshot(snapshot.map((item) => (item.key === key ? merged : item)));

  const dbPatch: Record<string, unknown> = {};
  if ("customTitle" in patch) dbPatch.custom_title = patch.customTitle ?? null;
  if ("memo" in patch) dbPatch.memo = patch.memo ?? "";
  if ("tags" in patch) dbPatch.tags = patch.tags ?? [];

  void (async () => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("saved_items")
        .update(dbPatch)
        .eq("item_key", key);
      if (error) void load();
    } catch {
      void load();
    }
  })();
}

/** 전체 비우기. */
export function clearSaved(): void {
  if (!snapshot.length) return;
  setSnapshot([]);
  void (async () => {
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("saved_items")
        .delete()
        .eq("user_id", user.id);
      if (error) void load();
    } catch {
      void load();
    }
  })();
}
