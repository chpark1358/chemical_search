"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { isSafeUrl, type Paper, type Patent, type SortKey } from "@/lib/api";
import { foldPapers, paperKey, patentKey, type FoldedPaper } from "@/lib/papers";
import { parsePatentCountry, type PatentCountry } from "@/lib/patent";

import CandidatePicker from "./CandidatePicker";
import CompoundCard from "./CompoundCard";
import EmptyState from "./EmptyState";
import { isActivationTarget, isTypingTarget } from "./keyboard";
import PaperList from "./PaperList";
import PatentList from "./PatentList";
import PatentToolbar, {
  type PatentCountryFilter,
  type PatentSortKey,
  type PatentSourceFilter
} from "./PatentToolbar";
import ProviderChips, { isProviderFailure, providerLabel } from "./ProviderChips";
import ResultTabs, { type ResultTab } from "./ResultTabs";
import SearchBar from "./SearchBar";
import SkeletonList, { LoadingBar } from "./SkeletonList";
import StatusBanner from "./StatusBanner";
import Toolbar, { type SourceFilter } from "./Toolbar";
import { usePaperSearch, type SearchPhase } from "./usePaperSearch";
import { useSelection } from "./useSelection";

function sortPapers(papers: FoldedPaper[], sort: SortKey): FoldedPaper[] {
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

/** 특허 정렬. relevance(원본순)는 입력 순서를 그대로 둔다. */
function sortPatents(patents: Patent[], sort: PatentSortKey): Patent[] {
  const copy = [...patents];
  if (sort === "date_desc") {
    copy.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  } else if (sort === "date_asc") {
    // 날짜 없는 항목은 뒤로 보낸다.
    copy.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
  } else if (sort === "assignee") {
    // 출원인 없는 항목은 뒤로 보낸다.
    copy.sort((a, b) => {
      if (!a.assignee) return 1;
      if (!b.assignee) return -1;
      return a.assignee.localeCompare(b.assignee, "ko");
    });
  }
  return copy;
}

/** 대소문자를 무시하고 keyword가 들어간 항목만 남기는 클라이언트 키워드 필터. */
function matchesKeyword(fields: Array<string | null>, keyword: string): boolean {
  const term = keyword.trim().toLowerCase();
  if (!term) return true;
  return fields.some((field) => field !== null && field.toLowerCase().includes(term));
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

const PATENT_COUNTRY_ORDER: PatentCountry[] = ["US", "KR", "EP", "WO", "CN", "JP", "기타"];

export default function PaperSearchApp() {
  const { phase, record, errorMessage, lastQuery, submit, chooseCandidate, retry } =
    usePaperSearch();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("relevance");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [fold, setFold] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [activeTab, setActiveTab] = useState<ResultTab>("papers");

  // 특허 탭 전용 정렬/필터 상태.
  const [patentSort, setPatentSort] = useState<PatentSortKey>("relevance");
  const [patentSourceFilter, setPatentSourceFilter] = useState<PatentSourceFilter>("all");
  const [patentCountryFilter, setPatentCountryFilter] =
    useState<PatentCountryFilter>("all");

  // 안정 키 기반 다중 선택(탭별). 정렬/필터/탭 전환과 무관하게 유지된다.
  const paperSelection = useSelection();
  const patentSelection = useSelection();

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

  // 파이프라인: 출처 필터 → 키워드 필터 → (중복 접기) → 정렬.
  // 접기는 sourceFilter/keyword 이후에 적용해야 "보이는 항목"끼리만 묶인다.
  const visiblePapers = useMemo<FoldedPaper[]>(() => {
    const bySource =
      sourceFilter === "all"
        ? allPapers
        : allPapers.filter((paper) => paper.source === sourceFilter);
    const byKeyword = bySource.filter((paper) =>
      matchesKeyword([paper.title, paper.authors.join(" "), paper.venue], keyword)
    );
    const folded = fold
      ? foldPapers(byKeyword)
      : byKeyword.map((paper) => ({ ...paper, sources: [paper.source] }));
    return sortPapers(folded, sort);
  }, [allPapers, sort, sourceFilter, keyword, fold]);

  // 접기 적용 전(필터만 적용) 수집 건수 — "수집 M건" 표기에 쓴다.
  const collectedPaperCount = useMemo(() => {
    const bySource =
      sourceFilter === "all"
        ? allPapers
        : allPapers.filter((paper) => paper.source === sourceFilter);
    return bySource.filter((paper) =>
      matchesKeyword([paper.title, paper.authors.join(" "), paper.venue], keyword)
    ).length;
  }, [allPapers, sourceFilter, keyword]);

  // 결과에 실제로 존재하는 특허 출처/국가(필터 칩 노출 결정).
  const availablePatentSources = useMemo(() => {
    const present = new Set(allPatents.map((patent) => patent.source));
    return (["surechembl", "kipris"] as const).filter((source) => present.has(source));
  }, [allPatents]);

  const availablePatentCountries = useMemo(() => {
    const present = new Set(
      allPatents.map((patent) => parsePatentCountry(patent.publication_number))
    );
    return PATENT_COUNTRY_ORDER.filter((country) => present.has(country));
  }, [allPatents]);

  // 특허 파이프라인: 출처 필터 → 국가 필터 → 키워드 필터 → 정렬.
  const visiblePatents = useMemo(() => {
    const bySource =
      patentSourceFilter === "all"
        ? allPatents
        : allPatents.filter((patent) => patent.source === patentSourceFilter);
    const byCountry =
      patentCountryFilter === "all"
        ? bySource
        : bySource.filter(
            (patent) =>
              parsePatentCountry(patent.publication_number) === patentCountryFilter
          );
    const byKeyword = byCountry.filter((patent) =>
      matchesKeyword(
        [patent.title, patent.publication_number, patent.assignee],
        keyword
      )
    );
    return sortPatents(byKeyword, patentSort);
  }, [allPatents, patentSourceFilter, patentCountryFilter, keyword, patentSort]);

  // 선택된 항목(내보내기용). 안정 키 기준으로 현재 보이는/전체 항목에서 추린다.
  const selectedPapers = useMemo(
    () => visiblePapers.filter((paper) => paperSelection.isSelected(paperKey(paper))),
    [visiblePapers, paperSelection]
  );
  const selectedPatents = useMemo(
    () => visiblePatents.filter((patent) => patentSelection.isSelected(patentKey(patent))),
    [visiblePatents, patentSelection]
  );

  const visiblePaperKeys = useMemo(
    () => visiblePapers.map(paperKey),
    [visiblePapers]
  );
  const visiblePatentKeys = useMemo(
    () => visiblePatents.map(patentKey),
    [visiblePatents]
  );

  // 키보드 화살표/Enter 내비게이션은 현재 탭의 항목 목록을 대상으로 한다.
  const navItems: Array<Paper | Patent> =
    activeTab === "papers" ? visiblePapers : visiblePatents;

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
    setFold(true);
    setSelectedIndex(-1);
    setActiveTab("papers");
    setPatentSort("relevance");
    setPatentSourceFilter("all");
    setPatentCountryFilter("all");
    paperSelection.clear();
    patentSelection.clear();
    submit(value);
  }

  // 탭 전환 시 키보드 선택을 초기화한다 (목록이 달라지므로). 다중 선택은 유지한다.
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

  function handleFoldChange(next: boolean) {
    setSelectedIndex(-1);
    setFold(next);
  }

  function handlePatentSortChange(next: PatentSortKey) {
    setSelectedIndex(-1);
    setPatentSort(next);
  }

  function handlePatentSourceFilterChange(next: PatentSourceFilter) {
    setSelectedIndex(-1);
    setPatentSourceFilter(next);
  }

  function handlePatentCountryFilterChange(next: PatentCountryFilter) {
    setSelectedIndex(-1);
    setPatentCountryFilter(next);
  }

  // 키워드 필터가 바뀌면 키보드 선택을 초기화한다 (행 목록이 달라지므로).
  function handleKeywordChange(next: string) {
    setSelectedIndex(-1);
    setKeyword(next);
  }

  // 논문 필터를 모두 초기화한다(필터로 결과가 모두 숨었을 때 사용).
  function handleResetPaperFilters() {
    setSelectedIndex(-1);
    setKeyword("");
    setSourceFilter("all");
  }

  // 특허 필터를 모두 초기화한다.
  function handleResetPatentFilters() {
    setSelectedIndex(-1);
    setKeyword("");
    setPatentSourceFilter("all");
    setPatentCountryFilter("all");
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
                      allSelected={paperSelection.allSelected(visiblePaperKeys)}
                      count={visiblePapers.length}
                      fold={fold}
                      keyword={keyword}
                      onClearSelection={paperSelection.clear}
                      onFoldChange={handleFoldChange}
                      onKeywordChange={handleKeywordChange}
                      onSortChange={handleSortChange}
                      onSourceFilterChange={handleSourceFilterChange}
                      onToggleAll={() => paperSelection.toggleAll(visiblePaperKeys)}
                      searchId={record.search_id}
                      selectedCount={paperSelection.count}
                      selectedPapers={selectedPapers}
                      sort={sort}
                      sourceFilter={sourceFilter}
                      total={collectedPaperCount}
                      visiblePapers={visiblePapers}
                    />
                    <PaperList
                      filtered={allPapers.length > 0}
                      highlight={record.compound?.name ?? ""}
                      isChecked={(paper) => paperSelection.isSelected(paperKey(paper))}
                      onResetFilters={handleResetPaperFilters}
                      onSelect={setSelectedIndex}
                      onToggleCheck={(paper) => paperSelection.toggle(paperKey(paper))}
                      papers={visiblePapers}
                      selectedIndex={selectedIndex}
                    />
                  </>
                ) : (
                  <>
                    <PatentToolbar
                      allSelected={patentSelection.allSelected(visiblePatentKeys)}
                      availableCountries={availablePatentCountries}
                      availableSources={availablePatentSources}
                      count={visiblePatents.length}
                      countryFilter={patentCountryFilter}
                      keyword={keyword}
                      onClearSelection={patentSelection.clear}
                      onCountryFilterChange={handlePatentCountryFilterChange}
                      onKeywordChange={handleKeywordChange}
                      onSortChange={handlePatentSortChange}
                      onSourceFilterChange={handlePatentSourceFilterChange}
                      onToggleAll={() => patentSelection.toggleAll(visiblePatentKeys)}
                      searchId={record.search_id}
                      selectedCount={patentSelection.count}
                      selectedPatents={selectedPatents}
                      sort={patentSort}
                      sourceFilter={patentSourceFilter}
                      total={allPatents.length}
                      visiblePatents={visiblePatents}
                    />
                    <PatentList
                      filtered={allPatents.length > 0}
                      isChecked={(patent) =>
                        patentSelection.isSelected(patentKey(patent))
                      }
                      onResetFilters={handleResetPatentFilters}
                      onSelect={setSelectedIndex}
                      onToggleCheck={(patent) =>
                        patentSelection.toggle(patentKey(patent))
                      }
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
