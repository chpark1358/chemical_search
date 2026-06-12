"use client";

import { useEffect, useRef, useState } from "react";

import {
  ApiError,
  createSearch,
  getSearch,
  selectSearchCandidate,
  type SearchRecord
} from "@/lib/api";

export type SearchPhase =
  | "idle"
  | "creating"
  | "needs_candidate_selection"
  | "running"
  | "done"
  | "partial"
  | "failed"
  | "pollFailed"
  | "unauthorized";

/** ApiError 401(세션 만료/미인증) 여부. 재로그인 흐름 분기에 쓴다. */
function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

const POLL_INTERVAL_MS = 1_200;
const POLL_BACKOFF_INTERVAL_MS = 3_000;
const POLL_BACKOFF_AFTER = 10;
const POLL_GIVE_UP_MS = 90_000;

export interface PaperSearchState {
  phase: SearchPhase;
  record: SearchRecord | null;
  errorMessage: string | null;
  /** 마지막으로 제출한(트림된) 검색어. retry 시 입력창 동기화에 사용한다. */
  lastQuery: string;
  submit: (query: string) => void;
  chooseCandidate: (candidateId: string) => void;
  retry: () => void;
}

export function usePaperSearch(): PaperSearchState {
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [record, setRecord] = useState<SearchRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState("");

  // 세대(generation) 토큰: submit/선택/재시도마다 증가시켜
  // 이전 세대의 늦은 응답이 새 검색 상태를 덮어쓰지 못하게 한다.
  const generationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordRef = useRef<SearchRecord | null>(null);
  const lastQueryRef = useRef("");
  const pollCountRef = useRef(0);
  const pollStartedAtRef = useRef(0);
  const phaseRef = useRef<SearchPhase>("idle");

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  function setPhaseSafe(next: SearchPhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function beginGeneration(): number {
    clearTimer();
    generationRef.current += 1;
    pollCountRef.current = 0;
    pollStartedAtRef.current = Date.now();
    return generationRef.current;
  }

  function applyRecord(generation: number, next: SearchRecord) {
    if (generation !== generationRef.current) return;
    recordRef.current = next;
    setRecord(next);
    switch (next.status) {
      case "needs_candidate_selection":
        setPhaseSafe("needs_candidate_selection");
        break;
      case "running":
        setPhaseSafe("running");
        schedulePoll(generation, next.search_id);
        break;
      case "done":
        setPhaseSafe("done");
        break;
      case "partial":
        setPhaseSafe("partial");
        break;
      default:
        setErrorMessage(next.error ?? "검색에 실패했습니다.");
        setPhaseSafe("failed");
    }
  }

  function schedulePoll(generation: number, searchId: string) {
    if (generation !== generationRef.current) return;
    if (Date.now() - pollStartedAtRef.current >= POLL_GIVE_UP_MS) {
      setPhaseSafe("pollFailed");
      return;
    }
    const interval =
      pollCountRef.current >= POLL_BACKOFF_AFTER
        ? POLL_BACKOFF_INTERVAL_MS
        : POLL_INTERVAL_MS;
    timerRef.current = setTimeout(() => {
      void pollOnce(generation, searchId);
    }, interval);
  }

  async function pollOnce(generation: number, searchId: string) {
    if (generation !== generationRef.current) return;
    pollCountRef.current += 1;
    try {
      const next = await getSearch(searchId);
      if (generation !== generationRef.current) return;
      if (next.search_id !== searchId) return;
      applyRecord(generation, next);
    } catch (error) {
      if (generation !== generationRef.current) return;
      if (isUnauthorized(error)) {
        // 검색 도중 세션이 만료됨 — 401은 지연(pollFailed)이 아니라 인증 문제이므로
        // 전용 상태로 전환해 재로그인을 안내한다.
        clearTimer();
        setPhaseSafe("unauthorized");
        return;
      }
      if (error instanceof ApiError && error.status === 404) {
        // 검색 레코드가 서버에서 만료됨(TTL/축출/재시작) — 재폴링해도 살아나지 않으므로
        // failed로 전환한다. failed에서의 재시도는 lastQuery로 새 검색을 제출한다.
        setErrorMessage("검색이 만료되었습니다. 다시 검색해 주세요.");
        setPhaseSafe("failed");
        return;
      }
      setPhaseSafe("pollFailed");
    }
  }

  async function runSubmit(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    const generation = beginGeneration();
    lastQueryRef.current = trimmed;
    setLastQuery(trimmed);
    recordRef.current = null;
    setRecord(null);
    setErrorMessage(null);
    setPhaseSafe("creating");
    try {
      const created = await createSearch({ query: trimmed });
      applyRecord(generation, created);
    } catch (error) {
      if (generation !== generationRef.current) return;
      if (isUnauthorized(error)) {
        setPhaseSafe("unauthorized");
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : "검색을 시작하지 못했습니다."
      );
      setPhaseSafe("failed");
    }
  }

  async function runChoose(candidateId: string) {
    const current = recordRef.current;
    if (!current) return;
    const generation = beginGeneration();
    setErrorMessage(null);
    setPhaseSafe("creating");
    try {
      const next = await selectSearchCandidate(current.search_id, candidateId);
      applyRecord(generation, next);
    } catch (error) {
      if (generation !== generationRef.current) return;
      if (isUnauthorized(error)) {
        setPhaseSafe("unauthorized");
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : "후보를 선택하지 못했습니다."
      );
      setPhaseSafe("failed");
    }
  }

  function retry() {
    const current = recordRef.current;
    if (phaseRef.current === "pollFailed" && current) {
      // 같은 검색을 이어서 다시 폴링한다 (90초 타이머 리셋).
      const generation = beginGeneration();
      setErrorMessage(null);
      setPhaseSafe("running");
      void pollOnce(generation, current.search_id);
      return;
    }
    if (lastQueryRef.current) {
      void runSubmit(lastQueryRef.current);
    }
  }

  return {
    phase,
    record,
    errorMessage,
    lastQuery,
    submit: (query: string) => {
      void runSubmit(query);
    },
    chooseCandidate: (candidateId: string) => {
      void runChoose(candidateId);
    },
    retry
  };
}
