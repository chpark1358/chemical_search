/**
 * 최근 검색 기록 — Supabase search_history 테이블 백엔드(사용자별).
 *
 * 성공한 검색(done/partial)마다 한 건씩 추가한다. 같은(정규화된) 검색어가 있으면
 * 이전 행들을 삭제(중복 제거, 최신 유지)하고, 표시·캐시는 최대 MAX_ENTRIES 건으로 제한한다.
 *
 * 데이터는 RLS로 로그인 사용자에게 스코프된다. 모듈 레벨 스토어 + useSyncExternalStore로
 * 첫 구독 시 1회 fetch하고, 변경은 낙관적으로 캐시에 반영한 뒤 Supabase에 비동기 적용한다.
 */

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { createClient } from "./supabase/client";

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

/** Supabase search_history 행 모양(snake_case). */
interface HistoryRow {
  query: string;
  compound_name: string | null;
  inchi_key: string | null;
  cid: number | null;
  paper_count: number | null;
  patent_count: number | null;
  ts: string;
}

/** 중복 제거 키: 대소문자/양끝 공백/연속 공백을 정규화한 검색어. */
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function rowToEntry(row: HistoryRow): SearchHistoryEntry {
  return {
    query: row.query,
    compoundName: row.compound_name,
    inchiKey: row.inchi_key,
    cid: row.cid,
    paperCount: row.paper_count ?? 0,
    patentCount: row.patent_count ?? 0,
    ts: new Date(row.ts).getTime()
  };
}

/** Supabase 오류가 인증(401)인지 판별한다. 401이면 단순 롤백 대신 재로그인 흐름으로 넘긴다. */
function isAuthError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "401" ||
    code === "PGRST301" ||
    message.includes("jwt") ||
    message.includes("unauthorized")
  );
}

// ── 모듈 레벨 스토어 ─────────────────────────────────────────────────────────

const EMPTY: SearchHistoryEntry[] = [];
let snapshot: SearchHistoryEntry[] = EMPTY;
let loaded = false;
let loading = false;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setSnapshot(next: SearchHistoryEntry[]): void {
  snapshot = next
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_ENTRIES);
  emit();
}

/** 서버에서 최신 기록을 가져와 캐시를 교체한다. */
async function load(): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("search_history")
      .select("query, compound_name, inchi_key, cid, paper_count, patent_count, ts")
      .order("ts", { ascending: false })
      .limit(MAX_ENTRIES);
    if (!error && data) {
      setSnapshot((data as HistoryRow[]).map(rowToEntry));
    }
  } catch {
    // 네트워크 오류는 조용히 무시하고 기존 캐시를 유지한다.
  } finally {
    loaded = true;
    loading = false;
  }
}

// 세션 하이드레이트 전 첫 load()가 익명으로 0건을 받는 레이스를 막기 위해 인증
// 상태가 준비/변경되면 재조회한다. 로그아웃 시 스토어를 완전히 리셋한다.
let authWired = false;
let authSubscription: { unsubscribe: () => void } | null = null;
function ensureAuthWired(): void {
  if (authWired) return;
  authWired = true;
  const { data } = createClient().auth.onAuthStateChange(
    (event: AuthChangeEvent, session: Session | null) => {
      if (event === "SIGNED_OUT") {
        // 스토어를 완전히 리셋한다(다른 사용자가 로그인하면 깨끗하게 재조회되도록).
        loaded = false;
        loading = false;
        setSnapshot([]);
      } else if (session) {
        void load();
      }
    }
  );
  authSubscription = data.subscription;
}

/** 인증 리스너를 해제한다(주로 테스트/정리용). */
export function teardownHistoryAuth(): void {
  authSubscription?.unsubscribe();
  authSubscription = null;
  authWired = false;
}

/**
 * 변이 실패를 처리한다. 401(세션 만료)이면 재로그인 흐름에 맡기고 낙관적 상태를
 * 그대로 둔다. 그 외 오류는 이전 스냅샷으로 명시적 롤백한다.
 */
function handleMutationFailure(
  prev: SearchHistoryEntry[],
  error: { code?: string; message?: string } | null
): void {
  if (isAuthError(error)) {
    console.warn("[searchHistory] 세션이 만료되었습니다. 다시 로그인해 주세요.");
    return;
  }
  console.warn("[searchHistory] 기록 변경에 실패해 이전 상태로 되돌립니다.", error);
  setSnapshot(prev);
}

/** 변경 구독. 첫 구독 시 1회 fetch하고 인증 변화에 재조회를 연결한다. */
export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  ensureAuthWired();
  if (!loaded && !loading) void load();
  return () => {
    listeners.delete(listener);
  };
}

/** 캐시된 스냅샷(useSyncExternalStore용, 안정 참조). */
export function getHistorySnapshot(): SearchHistoryEntry[] {
  return snapshot;
}

/** 서버 스냅샷(항상 동일 참조의 빈 배열). */
export function getServerHistorySnapshot(): SearchHistoryEntry[] {
  return EMPTY;
}

/** 최신순 정렬된 기록 목록(최신이 앞). */
export function listHistory(): SearchHistoryEntry[] {
  return snapshot;
}

// ── 변경(낙관적 갱신 + Supabase 반영) ────────────────────────────────────────

/**
 * 검색 기록을 추가한다. 같은(정규화된) 검색어가 있으면 캐시에서 제거 후 최신으로
 * 다시 추가하고, Supabase에서도 같은 검색어의 이전 행들을 삭제한 뒤 새 행을 넣는다.
 */
export function addHistory(entry: Omit<SearchHistoryEntry, "ts">): void {
  const query = entry.query.trim();
  if (!query) return;
  const key = normalizeQuery(query);
  const prev = snapshot;
  const next: SearchHistoryEntry = { ...entry, query, ts: Date.now() };
  const deduped = snapshot.filter((item) => normalizeQuery(item.query) !== key);
  setSnapshot([next, ...deduped]);

  void (async () => {
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        handleMutationFailure(prev, { code: "401" });
        return;
      }
      // 같은 검색어의 이전 기록을 지운다(중복 제거, 최신만 유지).
      await supabase
        .from("search_history")
        .delete()
        .eq("user_id", user.id)
        .eq("query", query);
      const { error } = await supabase.from("search_history").insert({
        user_id: user.id,
        query,
        compound_name: entry.compoundName,
        inchi_key: entry.inchiKey,
        cid: entry.cid,
        paper_count: entry.paperCount,
        patent_count: entry.patentCount
      });
      if (error) handleMutationFailure(prev, error);
    } catch (error) {
      handleMutationFailure(prev, error as { code?: string; message?: string });
    }
  })();
}

/** 단일 기록 삭제(정규화된 검색어 기준). */
export function removeHistory(query: string): void {
  const key = normalizeQuery(query);
  const match = snapshot.find((item) => normalizeQuery(item.query) === key);
  if (!match) return;
  const prev = snapshot;
  setSnapshot(snapshot.filter((item) => normalizeQuery(item.query) !== key));

  void (async () => {
    try {
      const supabase = createClient();
      // 방어적 심층 방어: RLS에 더해 user_id로도 스코프한다.
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        handleMutationFailure(prev, { code: "401" });
        return;
      }
      const { error } = await supabase
        .from("search_history")
        .delete()
        .eq("user_id", user.id)
        .eq("query", match.query);
      if (error) handleMutationFailure(prev, error);
    } catch (error) {
      handleMutationFailure(prev, error as { code?: string; message?: string });
    }
  })();
}

/** 모든 기록 삭제. */
export function clearHistory(): void {
  if (!snapshot.length) return;
  const prev = snapshot;
  setSnapshot([]);
  void (async () => {
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        handleMutationFailure(prev, { code: "401" });
        return;
      }
      const { error } = await supabase
        .from("search_history")
        .delete()
        .eq("user_id", user.id);
      if (error) handleMutationFailure(prev, error);
    } catch (error) {
      handleMutationFailure(prev, error as { code?: string; message?: string });
    }
  })();
}
