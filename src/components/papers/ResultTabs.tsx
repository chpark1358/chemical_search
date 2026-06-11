"use client";

export type ResultTab = "papers" | "patents";

interface ResultTabsProps {
  active: ResultTab;
  paperCount: number;
  patentCount: number;
  onChange: (tab: ResultTab) => void;
}

const TABS: ReadonlyArray<{ id: ResultTab; label: string }> = [
  { id: "papers", label: "논문" },
  { id: "patents", label: "특허" }
];

export default function ResultTabs({
  active,
  paperCount,
  patentCount,
  onChange
}: ResultTabsProps) {
  const counts: Record<ResultTab, number> = {
    papers: paperCount,
    patents: patentCount
  };

  return (
    <div
      aria-label="결과 유형"
      className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface-1 p-1"
      role="tablist"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            aria-selected={isActive}
            className={`rounded-md px-3 py-1 text-sm transition-colors duration-150 ${
              isActive
                ? "bg-primary text-ink"
                : "text-ink-subtle hover:bg-surface-2 hover:text-ink-muted"
            }`}
            data-testid={`result-tab-${tab.id}`}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}{" "}
            <span className={`font-mono ${isActive ? "text-ink" : "text-ink-tertiary"}`}>
              {counts[tab.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
