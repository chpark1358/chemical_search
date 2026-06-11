"use client";

import type { Paper, PaperSourceName, SortKey } from "@/lib/api";

import ExportMenu from "./ExportMenu";
import { providerLabel } from "./ProviderChips";

export type SourceFilter = "all" | PaperSourceName;

interface ToolbarProps {
  /** 화면에 보이는 논문 건수(접기·필터 적용 후). */
  count: number;
  /** 수집한 원본 논문 건수(접기 전). */
  total: number;
  sort: SortKey;
  sourceFilter: SourceFilter;
  keyword: string;
  searchId: string;
  /** 결과에 실제로 존재하는 출처(칩 노출 여부·순서 결정). */
  availableSources: PaperSourceName[];
  /** 중복 접기 켜짐 여부. */
  fold: boolean;
  /** 다중 선택 상태. */
  selectedCount: number;
  allSelected: boolean;
  /** 내보내기용: 현재 보이는 논문과 선택된 논문. */
  visiblePapers: Paper[];
  selectedPapers: Paper[];
  onSortChange: (sort: SortKey) => void;
  onSourceFilterChange: (filter: SourceFilter) => void;
  onKeywordChange: (keyword: string) => void;
  onFoldChange: (fold: boolean) => void;
  onToggleAll: () => void;
  onClearSelection: () => void;
}

export default function Toolbar({
  count,
  total,
  sort,
  sourceFilter,
  keyword,
  searchId,
  availableSources,
  fold,
  selectedCount,
  allSelected,
  visiblePapers,
  selectedPapers,
  onSortChange,
  onSourceFilterChange,
  onKeywordChange,
  onFoldChange,
  onToggleAll,
  onClearSelection
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink-muted">
          {fold ? "고유" : "논문"} <span className="font-mono">{count}</span>건
          {fold && count !== total ? (
            <span className="text-ink-tertiary">
              {" "}
              · 수집 <span className="font-mono">{total}</span>건
            </span>
          ) : null}
          {!fold && count !== total ? (
            <span className="text-ink-tertiary">
              {" "}
              / 전체 <span className="font-mono">{total}</span>건
            </span>
          ) : null}
        </p>
        {/* 출처 필터: 결과에 존재하는 출처가 2개 이상일 때만 의미가 있다(특허 툴바와 동일). */}
        {availableSources.length > 1 ? (
          <div aria-label="출처 필터" className="flex items-center gap-1.5" role="group">
            <SourceChip
              active={sourceFilter === "all"}
              label="전체"
              onClick={() => onSourceFilterChange("all")}
            />
            {availableSources.map((source) => (
              <SourceChip
                active={sourceFilter === source}
                key={source}
                label={providerLabel(source)}
                onClick={() => onSourceFilterChange(source)}
              />
            ))}
          </div>
        ) : null}
        <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
          <input
            checked={fold}
            className="size-3.5 cursor-pointer accent-primary"
            data-testid="fold-toggle"
            onChange={(event) => onFoldChange(event.target.checked)}
            type="checkbox"
          />
          중복 접기
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SelectionControls
          allSelected={allSelected}
          onClearSelection={onClearSelection}
          onToggleAll={onToggleAll}
          selectedCount={selectedCount}
        />
        <input
          aria-label="키워드로 결과 거르기"
          className="h-8 w-40 rounded-lg border border-hairline bg-surface-1 px-2.5 text-sm text-ink transition-colors duration-150 placeholder:text-ink-tertiary hover:border-hairline-strong focus:border-hairline-strong focus:outline-2 focus:outline-primary/50"
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="제목·저자·저널 거르기"
          type="search"
          value={keyword}
        />
        <label className="flex items-center gap-2 text-xs text-ink-subtle">
          정렬
          <select
            aria-label="정렬 기준"
            className="h-8 rounded-lg border border-hairline bg-surface-1 px-2 text-sm text-ink transition-colors duration-150 hover:border-hairline-strong focus:border-hairline-strong focus:outline-2 focus:outline-primary/50"
            onChange={(event) => onSortChange(event.target.value as SortKey)}
            value={sort}
          >
            <option value="relevance">관련도</option>
            <option value="citations">인용수</option>
            <option value="year">연도</option>
          </select>
        </label>
        <ExportMenu
          kind="papers"
          papers={visiblePapers}
          searchId={searchId}
          selectedPapers={selectedPapers}
        />
      </div>
    </div>
  );
}

function SourceChip({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`rounded-md border px-2.5 py-1 text-xs transition-colors duration-150 ${
        active
          ? "border-primary bg-surface-2 text-ink"
          : "border-hairline bg-surface-1 text-ink-subtle hover:border-hairline-strong hover:text-ink-muted"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

/** "N개 선택" 표시 + 전체선택/해제 토글. 선택이 없으면 전체선택 버튼만 노출한다. */
export function SelectionControls({
  selectedCount,
  allSelected,
  onToggleAll,
  onClearSelection
}: {
  selectedCount: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onClearSelection: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {selectedCount > 0 ? (
        <span className="text-xs text-ink-muted" data-testid="selected-count">
          <span className="font-mono">{selectedCount}</span>개 선택
        </span>
      ) : null}
      <button
        className="h-8 rounded-lg border border-hairline bg-surface-1 px-2.5 text-xs text-ink-subtle transition-colors duration-150 hover:border-hairline-strong hover:text-ink-muted"
        data-testid="select-all-toggle"
        onClick={onToggleAll}
        type="button"
      >
        {allSelected ? "선택 해제" : "전체 선택"}
      </button>
      {selectedCount > 0 && !allSelected ? (
        <button
          className="h-8 rounded-lg border border-hairline bg-surface-1 px-2.5 text-xs text-ink-subtle transition-colors duration-150 hover:border-hairline-strong hover:text-ink-muted"
          onClick={onClearSelection}
          type="button"
        >
          전체 해제
        </button>
      ) : null}
    </div>
  );
}
