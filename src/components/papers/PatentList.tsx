import type { Patent } from "@/lib/api";

import PatentRow from "./PatentRow";

interface PatentListProps {
  patents: Patent[];
  totalHits: number | null;
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export default function PatentList({
  patents,
  totalHits,
  selectedIndex,
  onSelect
}: PatentListProps) {
  if (!patents.length) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-12 text-center text-sm text-ink-subtle">
        관련 특허를 찾지 못했습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {totalHits !== null ? (
        <p className="text-sm text-ink-muted">
          상위 <span className="font-mono">{patents.length}</span>건
          <span className="text-ink-tertiary">
            {" "}
            / 전체 <span className="font-mono">{totalHits.toLocaleString()}</span>건
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
