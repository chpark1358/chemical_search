"use client";

export type ResultTab = "papers" | "patents";

/** 탭 버튼과 패널을 ARIA로 연결하기 위한 안정 id 헬퍼. */
export function resultTabId(tab: ResultTab): string {
  return `result-tab-${tab}`;
}

export function resultPanelId(tab: ResultTab): string {
  return `result-panel-${tab}`;
}

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
            aria-controls={resultPanelId(tab.id)}
            aria-selected={isActive}
            className={`rounded-md px-3 py-1 text-sm transition-colors duration-150 ${
              isActive
                ? "bg-primary text-ink"
                : "text-ink-subtle hover:bg-surface-2 hover:text-ink-muted"
            }`}
            data-testid={`result-tab-${tab.id}`}
            id={resultTabId(tab.id)}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            role="tab"
            tabIndex={isActive ? 0 : -1}
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
