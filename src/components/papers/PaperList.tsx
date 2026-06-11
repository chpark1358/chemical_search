import type { FoldedPaper } from "@/lib/papers";

import PaperRow from "./PaperRow";

interface PaperListProps {
  papers: FoldedPaper[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** 행에서 강조할 화합물명. */
  highlight?: string;
  /** 필터 적용 전 원본 논문이 1건 이상 있었는지(0건과 "필터로 모두 숨김" 구분용). */
  filtered?: boolean;
  onResetFilters?: () => void;
  /** 행 안정 키 → 다중 선택 체크 여부 판별. */
  isChecked: (paper: FoldedPaper) => boolean;
  onToggleCheck: (paper: FoldedPaper) => void;
}

export default function PaperList({
  papers,
  selectedIndex,
  onSelect,
  highlight,
  filtered = false,
  onResetFilters,
  isChecked,
  onToggleCheck
}: PaperListProps) {
  if (!papers.length) {
    // filtered=true인데 보이는 항목이 0이면 검색 결과가 아니라 필터가 다 숨긴 것이다.
    if (filtered) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-hairline bg-surface-1 px-4 py-12 text-center text-sm text-ink-subtle">
          필터에 맞는 논문이 0건입니다.
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
    <ul
      className="panel-highlight overflow-hidden rounded-xl border border-hairline bg-surface-1"
      data-testid="paper-list"
    >
      {papers.map((paper, index) => (
        <li className={index > 0 ? "border-t border-hairline" : undefined} key={paper.id}>
          <PaperRow
            checked={isChecked(paper)}
            highlight={highlight}
            onSelect={() => onSelect(index)}
            onToggleCheck={() => onToggleCheck(paper)}
            paper={paper}
            selected={index === selectedIndex}
          />
        </li>
      ))}
    </ul>
  );
}
