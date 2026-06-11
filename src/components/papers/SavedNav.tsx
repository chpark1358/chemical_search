"use client";

import { Bookmark, Search } from "lucide-react";

/**
 * 검색 화면 ↔ 저장됨 라이브러리 전환 버튼. 저장 건수 배지를 함께 보여준다.
 */
interface SavedNavProps {
  active: boolean;
  count: number;
  onToggle: () => void;
  className?: string;
}

export default function SavedNav({
  active,
  count,
  onToggle,
  className
}: SavedNavProps) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors duration-150 ${
        active
          ? "border-primary bg-surface-2 text-ink"
          : "border-hairline bg-surface-1 text-ink-subtle hover:border-hairline-strong hover:text-ink-muted"
      } ${className ?? ""}`}
      data-testid="saved-nav"
      onClick={onToggle}
      type="button"
    >
      {active ? (
        <Search aria-hidden="true" className="size-3.5" />
      ) : (
        <Bookmark aria-hidden="true" className="size-3.5" />
      )}
      {active ? "검색으로" : "저장됨"}
      {!active && count > 0 ? (
        <span
          className="rounded-full bg-primary px-1.5 py-px font-mono text-[11px] text-white"
          data-testid="saved-nav-count"
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
