import { Info } from "lucide-react";

import type { Patent } from "@/lib/api";

import PatentRow from "./PatentRow";

interface PatentListProps {
  patents: Patent[];
  totalHits: number | null;
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** 필터 적용 전 원본 특허가 1건 이상 있었는지(0건과 "필터로 모두 숨김" 구분용). */
  filtered?: boolean;
  onResetFilters?: () => void;
}

export default function PatentList({
  patents,
  totalHits,
  selectedIndex,
  onSelect,
  filtered = false,
  onResetFilters
}: PatentListProps) {
  if (!patents.length) {
    // filtered=true인데 보이는 항목이 0이면 검색 결과가 아니라 필터가 다 숨긴 것이다.
    if (filtered) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-hairline bg-surface-1 px-4 py-12 text-center text-sm text-ink-subtle">
          필터에 맞는 특허가 0건입니다.
          {onResetFilters ? (
            <button
              className="rounded-md border border-hairline bg-surface-1 px-3 py-1.5 text-xs text-ink-muted transition-colors duration-150 hover:border-hairline-strong hover:text-ink"
              onClick={onResetFilters}
              type="button"
            >
              필터 초기화
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-12 text-center text-sm text-ink-subtle">
        검색 결과 0건입니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {totalHits !== null ? (
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          상위 <span className="font-mono">{patents.length}</span>건
          <span className="text-ink-tertiary">
            {" "}
            / 전체 <span className="font-mono">{totalHits.toLocaleString()}</span>건
          </span>
          <span
            aria-label={`전체 ${totalHits.toLocaleString()}건 중 관련도 상위 ${patents.length}건만 표시합니다.`}
            className="inline-flex cursor-help text-ink-tertiary transition-colors duration-150 hover:text-ink-subtle"
            tabIndex={0}
            title={`전체 ${totalHits.toLocaleString()}건 중 관련도 상위 ${patents.length}건만 표시합니다.`}
          >
            <Info aria-hidden="true" className="size-3.5" />
          </span>
        </p>
      ) : null}
      <ul
        className="panel-highlight overflow-hidden rounded-xl border border-hairline bg-surface-1"
        data-testid="patent-list"
      >
        {patents.map((patent, index) => (
          <li
            className={index > 0 ? "border-t border-hairline" : undefined}
            key={patent.id}
          >
            <PatentRow
              onSelect={() => onSelect(index)}
              patent={patent}
              selected={index === selectedIndex}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
