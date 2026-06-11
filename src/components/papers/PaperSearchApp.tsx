"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { isSafeUrl, type Paper, type Patent, type SortKey } from "@/lib/api";

import CandidatePicker from "./CandidatePicker";
import CompoundCard from "./CompoundCard";
import EmptyState from "./EmptyState";
import { isActivationTarget, isTypingTarget } from "./keyboard";
import PaperList from "./PaperList";
import PatentList from "./PatentList";
import ProviderChips, { isProviderFailure, providerLabel } from "./ProviderChips";
import ResultTabs, { type ResultTab } from "./ResultTabs";
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

/** 대소문자를 무시하고 keyword가 들어간 항목만 남기는 클라이언트 키워드 필터. */
function matchesKeyword(fields: Array<string | null>, keyword: string): boolean {
  const term = keyword.trim().toLowerCase();
  if (!term) return true;
  return fields.some((field) => field !== null && field.toLowerCase().includes(term));
}

/** 특허 탭용 키워드 입력 바(논문 탭 Toolbar의 키워드 입력과 같은 스타일). */
function PatentKeywordBar({
  keyword,
  onKeywordChange
}: {
  keyword: string;
  onKeywordChange: (value: string) => void;
}) {
  return (
    <div className="flex justify-end">
      <input
        aria-label="키워드로 특허 거르기"
        className="h-8 w-48 rounded-lg border border-hairline bg-surface-1 px-2.5 text-sm text-ink transition-colors duration-150 placeholder:text-ink-tertiary hover:border-hairline-strong focus:border-hairline-strong focus:outline-2 focus:outline-primary/50"
        onChange={(event) => onKeywordChange(event.target.value)}
        placeholder="제목·공개번호·출원인 거르기"
        type="search"
        value={keyword}
      />
    </div>
  );
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
  const [keyword, setKeyword] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [activeTab, setActiveTab] = useState<ResultTab>("papers");
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

  const allPapers: Paper[] = useMemo(() => record?.papers ?? [], [record]);
  const allPatents: Patent[] = useMemo(() => record?.patents ?? [], [record]);

  // 파이프라인: 출처 필터 → 키워드 필터(제목/저자/저널) → 정렬.
  const visiblePapers = useMemo(() => {
    const bySource =
      sourceFilter === "all"
        ? allPapers
        : allPapers.filter((paper) => paper.source === sourceFilter);
    const byKeyword = bySource.filter((paper) =>
      matchesKeyword([paper.title, paper.authors.join(" "), paper.venue], keyword)
    );
    return sortPapers(byKeyword, sort);
  }, [allPapers, sort, sourceFilter, keyword]);

  // 특허는 정렬/출처 필터가 없고 키워드 필터(제목/공개번호/출원인)만 적용한다.
  const visiblePatents = useMemo(
    () =>
      allPatents.filter((patent) =>
        matchesKeyword(
          [patent.title, patent.publication_number, patent.assignee],
          keyword
        )
      ),
    [allPatents, keyword]
  );

  // 키보드 화살표/Enter 내비게이션은 현재 탭의 항목 목록을 대상으로 한다.
  const navItems = activeTab === "papers" ? visiblePapers : visiblePatents;

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

      if (typing || !navItems.length) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, navItems.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter" && selectedIndex >= 0) {
        // 포커스된 링크/버튼 등은 Enter로 자체 동작을 수행하므로 이중 실행을 막는다.
        if (isActivationTarget(event.target)) return;
        const item = navItems[selectedIndex];
        if (item && isSafeUrl(item.url)) {
          window.open(item.url, "_blank", "noopener,noreferrer");
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navItems, selectedIndex]);

  function handleSubmit(value: string) {
    setSort("relevance");
    setSourceFilter("all");
    setKeyword("");
    setSelectedIndex(-1);
    setActiveTab("papers");
    submit(value);
  }

  // 탭 전환 시 키보드 선택을 초기화한다 (목록이 달라지므로).
  function handleTabChange(next: ResultTab) {
    setSelectedIndex(-1);
    setActiveTab(next);
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

  // 키워드 필터가 바뀌면 키보드 선택을 초기화한다 (행 목록이 달라지므로).
  function handleKeywordChange(next: string) {
    setSelectedIndex(-1);
    setKeyword(next);
  }

  // 키워드/출처 필터를 모두 초기화한다(필터로 결과가 모두 숨었을 때 사용).
  function handleResetFilters() {
    setSelectedIndex(-1);
    setKeyword("");
    setSourceFilter("all");
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
                <ProviderChips
                  papers={record.papers}
                  patents={allPatents}
                  providers={record.providers}
                />
                {phase === "partial" ? (
                  <StatusBanner failedProviders={failedProviders} kind="partial" />
                ) : null}
                <ResultTabs
                  active={activeTab}
                  onChange={handleTabChange}
                  paperCount={record.papers.length}
                  patentCount={allPatents.length}
                />
                {activeTab === "papers" ? (
                  <>
                    <Toolbar
                      count={visiblePapers.length}
                      keyword={keyword}
                      onKeywordChange={handleKeywordChange}
                      onSortChange={handleSortChange}
                      onSourceFilterChange={handleSourceFilterChange}
                      searchId={record.search_id}
                      sort={sort}
                      sourceFilter={sourceFilter}
                      total={record.papers.length}
                    />
                    <PaperList
                      filtered={allPapers.length > 0}
                      highlight={record.compound?.name ?? ""}
                      onResetFilters={handleResetFilters}
                      onSelect={setSelectedIndex}
                      papers={visiblePapers}
                      selectedIndex={selectedIndex}
                    />
                  </>
                ) : (
                  <>
                    <PatentKeywordBar
                      keyword={keyword}
                      onKeywordChange={handleKeywordChange}
                    />
                    <PatentList
                      filtered={allPatents.length > 0}
                      onResetFilters={handleResetFilters}
                      onSelect={setSelectedIndex}
                      patents={visiblePatents}
                      selectedIndex={selectedIndex}
                      totalHits={record.patents_total_hits}
                    />
                  </>
                )}
                {navItems.length ? (
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
