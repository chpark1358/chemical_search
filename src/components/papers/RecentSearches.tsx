"use client";

import { Clock, X } from "lucide-react";

import type { SearchHistoryEntry } from "@/lib/searchHistory";

interface RecentSearchesProps {
  entries: SearchHistoryEntry[];
  /** 현재 결과로 보고 있는 화합물의 InChIKey(없으면 null) — "이미 검색함" 표시에 사용. */
  seenInchiKeys: ReadonlySet<string>;
  onPick: (query: string) => void;
  onRemove: (query: string) => void;
  onClear: () => void;
}

/**
 * 유휴 히어로에 노출되는 '최근 검색' 칩 행. 칩 클릭 시 해당 검색어로 재검색한다.
 * 같은 InChIKey가 이미 보인 적 있으면 '이미 검색함' 표식을 단다.
 */
export default function RecentSearches({
  entries,
  seenInchiKeys,
  onPick,
  onRemove,
  onClear
}: RecentSearchesProps) {
  if (!entries.length) return null;

  return (
    <div
      className="flex w-full max-w-[640px] flex-col gap-2"
      data-testid="recent-searches"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary">
          <Clock aria-hidden="true" className="size-3.5" />
          최근 검색
        </span>
        <button
          className="text-[11px] text-ink-tertiary transition-colors duration-150 hover:text-ink-subtle"
          data-testid="recent-clear"
          onClick={onClear}
          type="button"
        >
          전체 지우기
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {entries.map((entry) => {
          const alreadySeen =
            entry.inchiKey !== null && seenInchiKeys.has(entry.inchiKey);
          return (
            <span
              className="group/chip inline-flex items-center gap-1 rounded-md border border-hairline bg-surface-1 pl-2.5 pr-1 py-1 text-xs text-ink-subtle transition-colors duration-150 hover:border-hairline-strong hover:bg-surface-2"
              data-testid="recent-chip"
              key={`${entry.query}-${entry.ts}`}
            >
              <button
                className="inline-flex items-center gap-1.5 text-ink-subtle transition-colors duration-150 hover:text-ink-muted"
                onClick={() => onPick(entry.query)}
                title={
                  entry.compoundName
                    ? `${entry.query} · ${entry.compoundName}`
                    : entry.query
                }
                type="button"
              >
                <span className="max-w-40 truncate">{entry.query}</span>
                {alreadySeen ? (
                  <span
                    className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px text-[10px] text-ink-subtle"
                    data-testid="recent-seen"
                  >
                    이미 검색함
                  </span>
                ) : null}
              </button>
              <button
                aria-label={`최근 검색 삭제: ${entry.query}`}
                className="rounded p-0.5 text-ink-tertiary opacity-0 transition-opacity duration-150 hover:text-ink group-hover/chip:opacity-100 focus-visible:opacity-100"
                onClick={() => onRemove(entry.query)}
                type="button"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
