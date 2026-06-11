"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { isSafeUrl, type Paper, type SortKey } from "@/lib/api";

import CandidatePicker from "./CandidatePicker";
import CompoundCard from "./CompoundCard";
import EmptyState from "./EmptyState";
import { isActivationTarget, isTypingTarget } from "./keyboard";
import PaperList from "./PaperList";
import ProviderChips, { isProviderFailure, providerLabel } from "./ProviderChips";
import SearchBar from "./SearchBar";
import SkeletonList, { LoadingBar } from "./SkeletonList";
import StatusBanner from "./StatusBanner";
import Toolbar, { type SourceFilter } from "./Toolbar";
import { usePaperSearch, type SearchPhase } from "./usePaperSearch";

function sortPapers(papers: Paper[], sort: SortKey): Paper[] {
  const copy = [...papers];
  if (sort === "citations") {
    copy.sort((a, b) => (b.citations ?? -1) - (a.citations ?? -1));
  } else if (sort === "year") {
    copy.sort((a, b) => (b.year ?? -1) - (a.year ?? -1));
  } else {
    copy.sort((a, b) => b.score - a.score);
  }
  return copy;
}

function liveMessage(phase: SearchPhase, candidateCount: number, paperCount: number) {
  switch (phase) {
    case "creating":
      return "검색을 시작하고 있습니다.";
    case "needs_candidate_selection":
      return `화합물 후보 ${candidateCount}개 중 하나를 선택하세요.`;
    case "running":
      return "논문을 검색하고 있습니다.";
    case "done":
      return `논문 ${paperCount}건을 찾았습니다.`;
    case "partial":
      return `일부 출처에서 오류가 발생했습니다. 논문 ${paperCount}건을 찾았습니다.`;
    case "failed":
      return "검색에 실패했습니다.";
    case "pollFailed":
      return "응답이 지연되고 있습니다.";
    default:
      return "";
  }
}

export default function PaperSearchApp() {
  const { phase, record, errorMessage, lastQuery, submit, chooseCandidate, retry } =
    usePaperSearch();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("relevance");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isIdle = phase === "idle";
  // running 중에도 새 검색을 제출할 수 있다(세대 토큰이 이전 검색을 무효화한다).
  // 제출을 막는 것은 createSearch 요청이 진행 중인 creating 단계뿐이다.
  const isCreating = phase === "creating";
  const isLoading = isCreating || phase === "running";
  const hasResults = phase === "done" || phase === "partial";

  // 첫 제출 시 히어로 검색창이 언마운트되므로 컴팩트 검색창으로 포커스를 복원한다.
  useEffect(() => {
    if (!isIdle) searchInputRef.current?.focus();
  }, [isIdle]);

  const visiblePapers = useMemo(() => {
    const papers = record?.papers ?? [];
    const filtered =
      sourceFilter === "all"
        ? papers
        : papers.filter((paper) => paper.source === sourceFilter);
    return sortPapers(filtered, sort);
  }, [record, sort, sourceFilter]);

  const failedProviders = useMemo(
    () =>
      (record?.providers ?? [])
        .filter((provider) => isProviderFailure(provider.status))
        .map((provider) => providerLabel(provider.name)),
    [record]
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const typing = isTypingTarget(event.target);

      if (
        (event.key === "/" && !typing) ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === "Escape") {
        if (typing && event.target instanceof HTMLElement) {
          event.target.blur();
        } else {
          setSelectedIndex(-1);
        }
        return;
      }

      if (typing || !visiblePapers.length) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, visiblePapers.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter" && selectedIndex >= 0) {
        // 포커스된 링크/버튼 등은 Enter로 자체 동작을 수행하므로 이중 실행을 막는다.
        if (isActivationTarget(event.target)) return;
        const paper = visiblePapers[selectedIndex];
        if (paper && isSafeUrl(paper.url)) {
          window.open(paper.url, "_blank", "noopener,noreferrer");
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visiblePapers, selectedIndex]);

  function handleSubmit(value: string) {
    setSort("relevance");
    setSourceFilter("all");
    setSelectedIndex(-1);
    submit(value);
  }

  // 재시도는 마지막으로 제출한 검색어로 실행되므로, 입력창도 그 값으로 동기화한다.
  function handleRetry() {
    setQuery(lastQuery);
    retry();
  }

  // 정렬/필터가 바뀌면 키보드 선택을 초기화한다 (행 순서가 달라지므로).
  function handleSortChange(next: SortKey) {
    setSelectedIndex(-1);
    setSort(next);
  }

  function handleSourceFilterChange(next: SourceFilter) {
    setSelectedIndex(-1);
    setSourceFilter(next);
  }

  const announcement = liveMessage(
    phase,
    record?.candidates.length ?? 0,
    record?.papers.length ?? 0
  );

  return (
    <div className="flex flex-col pb-16">
      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>

      {isIdle ? (
        <section className="flex flex-col items-center gap-8 px-4 pt-28">
          <EmptyState />
          <SearchBar
            busy={false}
            inputRef={searchInputRef}
            onChange={setQuery}
            onSubmit={handleSubmit}
            value={query}
            variant="hero"
          />
          <p className="font-mono text-[11px] text-ink-tertiary">
            / 또는 Ctrl+K 검색 포커스
          </p>
        </section>
      ) : (
        <>
          <div className="sticky top-14 z-10 -mx-6 border-b border-hairline bg-canvas/90 px-6 py-3 backdrop-blur">
            <SearchBar
              busy={isCreating}
              inputRef={searchInputRef}
              onChange={setQuery}
              onSubmit={handleSubmit}
              value={query}
              variant="compact"
            />
            {isLoading ? (
              <div className="absolute inset-x-0 bottom-0">
                <LoadingBar />
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-4 pt-5">
            {phase === "creating" ? (
              <>
                <SkeletonList rows={4} />
                <p className="text-center font-mono text-[11px] text-ink-tertiary">
                  화합물을 확인하고 있습니다…
                </p>
              </>
            ) : null}

            {phase === "needs_candidate_selection" && record ? (
              <CandidatePicker
                candidates={record.candidates}
                onSelect={chooseCandidate}
              />
            ) : null}

            {phase === "running" ? (
              <>
                {record?.compound ? <CompoundCard compound={record.compound} /> : null}
                <SkeletonList />
                <p className="text-center font-mono text-[11px] text-ink-tertiary">
                  논문을 검색하고 있습니다…
                </p>
              </>
            ) : null}

            {hasResults && record ? (
              <>
                {record.compound ? <CompoundCard compound={record.compound} /> : null}
                <ProviderChips papers={record.papers} providers={record.providers} />
                {phase === "partial" ? (
                  <StatusBanner failedProviders={failedProviders} kind="partial" />
                ) : null}
                <Toolbar
                  count={visiblePapers.length}
                  onSortChange={handleSortChange}
                  onSourceFilterChange={handleSourceFilterChange}
                  searchId={record.search_id}
                  sort={sort}
                  sourceFilter={sourceFilter}
                  total={record.papers.length}
                />
                <PaperList
                  onSelect={setSelectedIndex}
                  papers={visiblePapers}
                  selectedIndex={selectedIndex}
                />
                {visiblePapers.length ? (
                  <p className="font-mono text-[11px] text-ink-tertiary">
                    ↑↓ 이동 · Enter 열기 · Esc 해제
                  </p>
                ) : null}
              </>
            ) : null}

            {phase === "failed" ? (
              <StatusBanner kind="failed" message={errorMessage} onRetry={handleRetry} />
            ) : null}

            {phase === "pollFailed" ? (
              <StatusBanner kind="pollFailed" onRetry={handleRetry} />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
