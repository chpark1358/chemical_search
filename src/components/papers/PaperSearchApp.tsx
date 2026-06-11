"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from "react";

import {
  isSafeUrl,
  type Paper,
  type PaperSourceName,
  type Patent,
  type SortKey
} from "@/lib/api";
import { foldPapers, paperKey, patentKey, type FoldedPaper } from "@/lib/papers";
import { parsePatentCountry, type PatentCountry } from "@/lib/patent";
import {
  addHistory,
  clearHistory,
  getHistorySnapshot,
  getServerHistorySnapshot,
  removeHistory,
  subscribeHistory
} from "@/lib/searchHistory";

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
import RecentSearches from "./RecentSearches";
import ResultTabs, { type ResultTab } from "./ResultTabs";
import SavedNav from "./SavedNav";
import SavedView from "./SavedView";
import SearchBar from "./SearchBar";
import SkeletonList, { LoadingBar } from "./SkeletonList";
import StatusBanner from "./StatusBanner";
import Toolbar, { type SourceFilter } from "./Toolbar";
import { usePaperSearch, type SearchPhase } from "./usePaperSearch";
import { useSavedItems } from "./useSavedItems";
import { useSelection } from "./useSelection";

/** URL 쿼리 파라미터를 안전하게 해석한다(없거나 잘못되면 기본값). */
function parseTab(value: string | null): ResultTab {
  return value === "patents" ? "patents" : "papers";
}

function parsePaperSort(value: string | null): SortKey {
  return value === "citations" || value === "year" ? value : "relevance";
}

const PAPER_SOURCES: ReadonlyArray<SourceFilter> = [
  "all",
  "semantic_scholar",
  "crossref",
  "openalex"
];

/** 논문 출처 칩의 안정 순서. 결과에 존재하는 것만 이 순서대로 노출한다. */
const PAPER_SOURCE_ORDER: PaperSourceName[] = [
  "semantic_scholar",
  "openalex",
  "crossref"
];

function parseSource(value: string | null): SourceFilter {
  return PAPER_SOURCES.includes(value as SourceFilter)
    ? (value as SourceFilter)
    : "all";
}

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

function PaperSearchAppInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { phase, record, errorMessage, lastQuery, submit, chooseCandidate, retry } =
    usePaperSearch();
  const saved = useSavedItems();

  // 초기 URL 파라미터(?q=&tab=&sort=&src=). 첫 렌더에서 1회 읽어 상태 초기값으로 쓴다.
  // 자동 검색 실행은 아래 effect에서 submit()으로 트리거한다(setState는 effect 밖에서).
  const initialQuery = (searchParams.get("q") ?? "").trim();
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<SortKey>(() =>
    parsePaperSort(searchParams.get("sort"))
  );
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(() =>
    parseSource(searchParams.get("src"))
  );
  const [keyword, setKeyword] = useState("");
  const [fold, setFold] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [activeTab, setActiveTab] = useState<ResultTab>(() =>
    parseTab(searchParams.get("tab"))
  );
  const [savedMode, setSavedMode] = useState(false);

  // 최근 검색 기록. useSyncExternalStore로 localStorage를 SSR 안전하게 구독한다
  // (서버 스냅샷은 빈 배열 → 하이드레이션 일관성 유지, 마운트 후 실제 기록으로 합쳐짐).
  const history = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getServerHistorySnapshot
  );

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

  // 초기 로드: ?q=가 있으면 그 검색을 자동 실행한다(탭/정렬/출처는 위 초기값으로 복원됨).
  // 마운트 1회만 실행한다(이후 사용자 조작이 URL을 덮어쓰므로 재실행 금지).
  // 여기서는 setState가 아니라 외부 시스템(검색 파이프라인)을 트리거한다.
  const didInitFromUrl = useRef(false);
  useEffect(() => {
    if (didInitFromUrl.current) return;
    didInitFromUrl.current = true;
    if (!initialQuery) return;
    submit(initialQuery);
    // submit은 안정 콜백이 아니지만, 마운트 1회 가드로 재실행을 막는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allPapers: Paper[] = useMemo(() => record?.papers ?? [], [record]);
  const allPatents: Patent[] = useMemo(() => record?.patents ?? [], [record]);

  // 결과에 실제로 존재하는 논문 출처(필터 칩 노출·순서 결정).
  // S2가 게이팅돼 결과에 없으면 칩도 자동으로 사라진다.
  const availablePaperSources = useMemo(() => {
    const present = new Set(allPapers.map((paper) => paper.source));
    return PAPER_SOURCE_ORDER.filter((source) => present.has(source));
  }, [allPapers]);

  // 활성 출처 필터가 더 이상 결과에 없는 출처를 가리키면 '전체'로 간주한다(렌더 중 파생).
  // setState 이펙트 대신 파생값을 써서 cascading render를 피한다.
  const effectiveSourceFilter: SourceFilter =
    sourceFilter !== "all" && !availablePaperSources.includes(sourceFilter)
      ? "all"
      : sourceFilter;

  // 성공한 검색(done/partial)마다 한 번씩: 검색 기록 추가 + 공유 가능한 URL 반영.
  // search_id는 휘발성이므로 URL에는 검색어(q)와 보기 상태(tab/sort/src)만 담는다.
  const recordedSearchIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== "done" && phase !== "partial") return;
    if (!record) return;
    if (recordedSearchIdRef.current === record.search_id) return;
    recordedSearchIdRef.current = record.search_id;
    // addHistory가 localStorage를 갱신하면 subscribeHistory 구독으로 history가 자동 반영된다.
    addHistory({
      query: record.query,
      compoundName: record.compound?.name ?? null,
      inchiKey: record.compound?.inchi_key ?? null,
      cid: record.compound?.cid ?? null,
      paperCount: record.papers.length,
      patentCount: record.patents.length
    });
  }, [phase, record]);

  // 보기 상태(검색어/탭/정렬/출처)를 URL 쿼리에 반영한다(전체 내비게이션 없이).
  // 결과가 있을 때만 동작하며, 저장됨 모드/유휴 상태에서는 건드리지 않는다.
  useEffect(() => {
    if (savedMode) return;
    if (phase !== "done" && phase !== "partial") return;
    if (!record) return;
    const params = new URLSearchParams();
    params.set("q", record.query);
    params.set("tab", activeTab);
    if (sort !== "relevance") params.set("sort", sort);
    if (effectiveSourceFilter !== "all") params.set("src", effectiveSourceFilter);
    const next = `?${params.toString()}`;
    if (typeof window !== "undefined" && window.location.search === next) return;
    router.replace(next, { scroll: false });
  }, [phase, record, activeTab, sort, effectiveSourceFilter, savedMode, router]);

  // 파이프라인: 출처 필터 → 키워드 필터 → (중복 접기) → 정렬.
  // 접기는 sourceFilter/keyword 이후에 적용해야 "보이는 항목"끼리만 묶인다.
  const visiblePapers = useMemo<FoldedPaper[]>(() => {
    const bySource =
      effectiveSourceFilter === "all"
        ? allPapers
        : allPapers.filter((paper) => paper.source === effectiveSourceFilter);
    const byKeyword = bySource.filter((paper) =>
      matchesKeyword([paper.title, paper.authors.join(" "), paper.venue], keyword)
    );
    const folded = fold
      ? foldPapers(byKeyword)
      : byKeyword.map((paper) => ({ ...paper, sources: [paper.source] }));
    return sortPapers(folded, sort);
  }, [allPapers, sort, effectiveSourceFilter, keyword, fold]);

  // 접기 적용 전(필터만 적용) 수집 건수 — "수집 M건" 표기에 쓴다.
  const collectedPaperCount = useMemo(() => {
    const bySource =
      effectiveSourceFilter === "all"
        ? allPapers
        : allPapers.filter((paper) => paper.source === effectiveSourceFilter);
    return bySource.filter((paper) =>
      matchesKeyword([paper.title, paper.authors.join(" "), paper.venue], keyword)
    ).length;
  }, [allPapers, effectiveSourceFilter, keyword]);

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
    setSavedMode(false);
    submit(value);
  }

  // 최근 검색 칩 클릭 → 입력창 동기화 후 재검색.
  function handlePickRecent(value: string) {
    setQuery(value);
    handleSubmit(value);
  }

  function handleRemoveRecent(value: string) {
    removeHistory(value);
  }

  function handleClearRecent() {
    clearHistory();
  }

  // 현재 결과로 확인된 InChIKey 집합("이미 검색함" 표식 기준).
  const seenInchiKeys = useMemo(() => {
    const set = new Set<string>();
    const current = record?.compound?.inchi_key;
    if (current) set.add(current);
    return set;
  }, [record]);

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

  // 저장됨 모드: 검색 결과 영역을 라이브러리로 대체한다(활성 검색이 없어도 동작).
  if (savedMode) {
    return (
      <div className="flex flex-col pb-16">
        <div className="sticky top-14 z-10 -mx-6 flex items-center justify-between gap-3 border-b border-hairline bg-canvas/90 px-6 py-3 backdrop-blur">
          <h2 className="text-sm font-semibold tracking-[-0.02em] text-ink">
            저장됨 <span className="font-mono text-ink-subtle">{saved.count}</span>
          </h2>
          <SavedNav active count={saved.count} onToggle={() => setSavedMode(false)} />
        </div>
        <div className="pt-5">
          <SavedView items={saved.items} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-16">
      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>

      {isIdle ? (
        <section className="flex flex-col items-center gap-8 px-4 pt-24">
          <EmptyState />
          <SearchBar
            busy={false}
            inputRef={searchInputRef}
            onChange={setQuery}
            onSubmit={handleSubmit}
            value={query}
            variant="hero"
          />
          <RecentSearches
            entries={history}
            onClear={handleClearRecent}
            onPick={handlePickRecent}
            onRemove={handleRemoveRecent}
            seenInchiKeys={seenInchiKeys}
          />
          <div className="flex items-center gap-3">
            <p className="font-mono text-[11px] text-ink-tertiary">
              / 또는 Ctrl+K 검색 포커스
            </p>
            <SavedNav
              active={false}
              count={saved.count}
              onToggle={() => setSavedMode(true)}
            />
          </div>
        </section>
      ) : (
        <>
          <div className="sticky top-14 z-10 -mx-6 border-b border-hairline bg-canvas/90 px-6 py-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <SearchBar
                  busy={isCreating}
                  inputRef={searchInputRef}
                  onChange={setQuery}
                  onSubmit={handleSubmit}
                  value={query}
                  variant="compact"
                />
              </div>
              <SavedNav
                active={false}
                count={saved.count}
                onToggle={() => setSavedMode(true)}
              />
            </div>
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
                      availableSources={availablePaperSources}
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
                      sourceFilter={effectiveSourceFilter}
                      total={collectedPaperCount}
                      visiblePapers={visiblePapers}
                    />
                    <PaperList
                      filtered={allPapers.length > 0}
                      highlight={record.compound?.name ?? ""}
                      isChecked={(paper) => paperSelection.isSelected(paperKey(paper))}
                      isSaved={(paper) => saved.isPaperSaved(paper)}
                      onResetFilters={handleResetPaperFilters}
                      onSelect={setSelectedIndex}
                      onToggleCheck={(paper) => paperSelection.toggle(paperKey(paper))}
                      onToggleSave={(paper) =>
                        saved.togglePaper(paper, record.compound?.name ?? null)
                      }
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
                      isSaved={(patent) => saved.isPatentSaved(patent)}
                      onResetFilters={handleResetPatentFilters}
                      onSelect={setSelectedIndex}
                      onToggleCheck={(patent) =>
                        patentSelection.toggle(patentKey(patent))
                      }
                      onToggleSave={(patent) =>
                        saved.togglePatent(patent, record.compound?.name ?? null)
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

/**
 * Next 16에서 useSearchParams는 Suspense 경계 안에서만 쓸 수 있다(빌드 시 CSR bailout).
 * 유휴 히어로와 동일한 레이아웃의 가벼운 폴백으로 감싼다.
 */
export default function PaperSearchApp() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center gap-8 px-4 pt-24 pb-16">
          <EmptyState />
        </div>
      }
    >
      <PaperSearchAppInner />
    </Suspense>
  );
}
