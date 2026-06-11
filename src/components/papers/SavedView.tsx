"use client";

import { Bookmark } from "lucide-react";
import { useMemo } from "react";

import type { Paper, Patent } from "@/lib/api";
import { removeSaved, type SavedItem } from "@/lib/savedItems";

import SavedExportMenu from "./SavedExportMenu";
import SavedRow from "./SavedRow";
import { SelectionControls } from "./Toolbar";
import { useSelection } from "./useSelection";

interface SavedGroupProps {
  title: string;
  kind: "papers" | "patents";
  items: SavedItem[];
  isChecked: (key: string) => boolean;
  onToggleCheck: (key: string) => void;
  onToggleAll: () => void;
  onClearSelection: () => void;
  allSelected: boolean;
  selectedCount: number;
  /** 내보낼 항목(선택이 있으면 선택분, 없으면 그룹 전체). */
  exportPapers: Paper[];
  exportPatents: Patent[];
}

function SavedGroup({
  title,
  kind,
  items,
  isChecked,
  onToggleCheck,
  onToggleAll,
  onClearSelection,
  allSelected,
  selectedCount,
  exportPapers,
  exportPatents
}: SavedGroupProps) {
  return (
    <section className="flex flex-col gap-3" data-testid={`saved-group-${kind}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-ink-muted">
          {title} <span className="font-mono">{items.length}</span>건
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <SelectionControls
            allSelected={allSelected}
            onClearSelection={onClearSelection}
            onToggleAll={onToggleAll}
            selectedCount={selectedCount}
          />
          <SavedExportMenu
            disabled={!items.length}
            kind={kind}
            papers={exportPapers}
            patents={exportPatents}
          />
        </div>
      </div>
      <ul
        className="panel-highlight overflow-hidden rounded-xl border border-hairline bg-surface-1"
        data-testid={`saved-list-${kind}`}
      >
        {items.map((item, index) => (
          <li
            className={index > 0 ? "border-t border-hairline" : undefined}
            key={item.key}
          >
            <SavedRow
              checked={isChecked(item.key)}
              item={item}
              onRemove={() => removeSaved(item.key)}
              onToggleCheck={() => onToggleCheck(item.key)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function SavedView({ items }: { items: SavedItem[] }) {
  const paperSelection = useSelection();
  const patentSelection = useSelection();

  const paperItems = useMemo(
    () => items.filter((item) => item.kind === "paper"),
    [items]
  );
  const patentItems = useMemo(
    () => items.filter((item) => item.kind === "patent"),
    [items]
  );

  const paperKeys = useMemo(() => paperItems.map((item) => item.key), [paperItems]);
  const patentKeys = useMemo(() => patentItems.map((item) => item.key), [patentItems]);

  // 내보내기 대상: 선택이 있으면 선택분, 없으면 그룹 전체.
  const exportPaperData = useMemo<Paper[]>(() => {
    const source =
      paperSelection.count > 0
        ? paperItems.filter((item) => paperSelection.isSelected(item.key))
        : paperItems;
    return source.map((item) => item.data as Paper);
  }, [paperItems, paperSelection]);

  const exportPatentData = useMemo<Patent[]>(() => {
    const source =
      patentSelection.count > 0
        ? patentItems.filter((item) => patentSelection.isSelected(item.key))
        : patentItems;
    return source.map((item) => item.data as Patent);
  }, [patentItems, patentSelection]);

  if (!items.length) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-xl border border-hairline bg-surface-1 px-4 py-16 text-center"
        data-testid="saved-empty"
      >
        <Bookmark aria-hidden="true" className="size-7 text-ink-tertiary" />
        <p className="text-sm font-medium text-ink-muted">
          아직 저장한 항목이 없습니다
        </p>
        <p className="max-w-sm text-xs leading-5 text-ink-subtle">
          검색 결과에서 항목의 별(☆)을 눌러 저장하면 이곳에 모입니다. 저장한 항목은
          계정에 보관되어 어느 기기에서 로그인하든 그대로 남아 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8" data-testid="saved-view">
      {paperItems.length ? (
        <SavedGroup
          allSelected={paperSelection.allSelected(paperKeys)}
          exportPapers={exportPaperData}
          exportPatents={[]}
          isChecked={paperSelection.isSelected}
          items={paperItems}
          kind="papers"
          onClearSelection={paperSelection.clear}
          onToggleAll={() => paperSelection.toggleAll(paperKeys)}
          onToggleCheck={paperSelection.toggle}
          selectedCount={paperSelection.count}
          title="논문"
        />
      ) : null}
      {patentItems.length ? (
        <SavedGroup
          allSelected={patentSelection.allSelected(patentKeys)}
          exportPapers={[]}
          exportPatents={exportPatentData}
          isChecked={patentSelection.isSelected}
          items={patentItems}
          kind="patents"
          onClearSelection={patentSelection.clear}
          onToggleAll={() => patentSelection.toggleAll(patentKeys)}
          onToggleCheck={patentSelection.toggle}
          selectedCount={patentSelection.count}
          title="특허"
        />
      ) : null}
    </div>
  );
}
