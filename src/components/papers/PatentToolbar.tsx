"use client";

import type { Patent, PatentSourceName } from "@/lib/api";
import { patentCountryLabel, type PatentCountry } from "@/lib/patent";

import ExportMenu from "./ExportMenu";
import { SelectionControls } from "./Toolbar";

/** 특허 정렬 기준. 관련도(원본순)가 기본. */
export type PatentSortKey =
  | "relevance"
  | "date_desc"
  | "date_asc"
  | "assignee";

export type PatentSourceFilter = "all" | PatentSourceName;
export type PatentCountryFilter = "all" | PatentCountry;

const SOURCE_LABELS: Record<PatentSourceName, string> = {
  google_patents: "Google Patents",
  surechembl: "SureChEMBL",
  kipris: "KIPRIS"
};

interface PatentToolbarProps {
  count: number;
  total: number;
  sort: PatentSortKey;
  sourceFilter: PatentSourceFilter;
  countryFilter: PatentCountryFilter;
  keyword: string;
  searchId: string;
  /** 결과에 실제로 존재하는 출처(칩 노출 여부 결정). */
  availableSources: PatentSourceName[];
  /** 결과에 실제로 존재하는 국가(칩 노출 여부 결정). */
  availableCountries: PatentCountry[];
  selectedCount: number;
  allSelected: boolean;
  visiblePatents: Patent[];
  selectedPatents: Patent[];
  onSortChange: (sort: PatentSortKey) => void;
  onSourceFilterChange: (filter: PatentSourceFilter) => void;
  onCountryFilterChange: (filter: PatentCountryFilter) => void;
  onKeywordChange: (keyword: string) => void;
  onToggleAll: () => void;
  onClearSelection: () => void;
}

export default function PatentToolbar({
  count,
  total,
  sort,
  sourceFilter,
  countryFilter,
  keyword,
  searchId,
  availableSources,
  availableCountries,
  selectedCount,
  allSelected,
  visiblePatents,
  selectedPatents,
  onSortChange,
  onSourceFilterChange,
  onCountryFilterChange,
  onKeywordChange,
  onToggleAll,
  onClearSelection
}: PatentToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink-muted">
          특허 <span className="font-mono">{count}</span>건
          {count !== total ? (
            <span className="text-ink-tertiary">
              {" "}
              / 전체 <span className="font-mono">{total}</span>건
            </span>
          ) : null}
        </p>

        {/* 출처 필터: 결과에 존재하는 출처가 2개 이상일 때만 의미가 있다. */}
        {availableSources.length > 1 ? (
          <div aria-label="특허 출처 필터" className="flex items-center gap-1.5" role="group">
            <SourceChip
              active={sourceFilter === "all"}
              label="전체"
              onClick={() => onSourceFilterChange("all")}
            />
            {availableSources.map((source) => (
              <SourceChip
                active={sourceFilter === source}
                key={source}
                label={SOURCE_LABELS[source]}
                onClick={() => onSourceFilterChange(source)}
              />
            ))}
          </div>
        ) : null}

        {/* 국가 필터: 결과에 존재하는 국가가 2개 이상일 때만 노출한다. */}
        {availableCountries.length > 1 ? (
          <div aria-label="특허 국가 필터" className="flex items-center gap-1.5" role="group">
            <SourceChip
              active={countryFilter === "all"}
              label="전체 국가"
              onClick={() => onCountryFilterChange("all")}
            />
            {availableCountries.map((country) => (
              <SourceChip
                active={countryFilter === country}
                key={country}
                label={patentCountryLabel(country)}
                onClick={() => onCountryFilterChange(country)}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SelectionControls
          allSelected={allSelected}
          onClearSelection={onClearSelection}
          onToggleAll={onToggleAll}
          selectedCount={selectedCount}
        />
        <input
          aria-label="키워드로 특허 거르기"
          className="h-8 w-44 rounded-lg border border-hairline bg-surface-1 px-2.5 text-sm text-ink transition-colors duration-150 placeholder:text-ink-tertiary hover:border-hairline-strong focus:border-hairline-strong focus:outline-2 focus:outline-primary/50"
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="제목·공개번호·출원인 거르기"
          type="search"
          value={keyword}
        />
        <label className="flex items-center gap-2 text-xs text-ink-subtle">
          정렬
          <select
            aria-label="특허 정렬 기준"
            className="h-8 rounded-lg border border-hairline bg-surface-1 px-2 text-sm text-ink transition-colors duration-150 hover:border-hairline-strong focus:border-hairline-strong focus:outline-2 focus:outline-primary/50"
            onChange={(event) => onSortChange(event.target.value as PatentSortKey)}
            value={sort}
          >
            <option value="relevance">관련도</option>
            <option value="date_desc">공개일 최신순</option>
            <option value="date_asc">공개일 오래된순</option>
            <option value="assignee">출원인 가나다순</option>
          </select>
        </label>
        <ExportMenu
          kind="patents"
          patents={visiblePatents}
          searchId={searchId}
          selectedPatents={selectedPatents}
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
