import type { Paper } from "@/lib/api";

import PaperRow from "./PaperRow";

interface PaperListProps {
  papers: Paper[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export default function PaperList({ papers, selectedIndex, onSelect }: PaperListProps) {
  if (!papers.length) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-12 text-center text-sm text-ink-subtle">
        조건에 맞는 논문이 없습니다.
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
            onSelect={() => onSelect(index)}
            paper={paper}
            selected={index === selectedIndex}
          />
        </li>
      ))}
    </ul>
  );
}
