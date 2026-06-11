"use client";

import type { SortKey, SourceName } from "@/lib/api";

import ExportMenu from "./ExportMenu";

export type SourceFilter = "all" | SourceName;

const FILTERS: ReadonlyArray<{ id: SourceFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "semantic_scholar", label: "Semantic Scholar" },
  { id: "crossref", label: "Crossref" },
  { id: "openalex", label: "OpenAlex" }
];

interface ToolbarProps {
  count: number;
  total: number;
  sort: SortKey;
  sourceFilter: SourceFilter;
  keyword: string;
  searchId: string;
  onSortChange: (sort: SortKey) => void;
  onSourceFilterChange: (filter: SourceFilter) => void;
  onKeywordChange: (keyword: string) => void;
}

export default function Toolbar({
  count,
  total,
  sort,
  sourceFilter,
  keyword,
  searchId,
  onSortChange,
  onSourceFilterChange,
  onKeywordChange
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink-muted">
          논문 <span className="font-mono">{count}</span>건
          {count !== total ? (
            <span className="text-ink-tertiary">
              {" "}
              / 전체 <span className="font-mono">{total}</span>건
            </span>
          ) : null}
        </p>
        <div aria-label="출처 필터" className="flex items-center gap-1.5" role="group">
          {FILTERS.map((filter) => (
            <button
              aria-pressed={sourceFilter === filter.id}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors duration-150 ${
                sourceFilter === filter.id
                  ? "border-primary bg-surface-2 text-ink"
                  : "border-hairline bg-surface-1 text-ink-subtle hover:border-hairline-strong hover:text-ink-muted"
              }`}
              key={filter.id}
              onClick={() => onSourceFilterChange(filter.id)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
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
        <ExportMenu searchId={searchId} />
      </div>
    </div>
  );
}
