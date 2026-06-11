"use client";

import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { exportUrl, type ExportFormat } from "@/lib/api";

const FORMATS: ReadonlyArray<{ format: ExportFormat; label: string }> = [
  { format: "csv", label: "CSV" },
  { format: "markdown", label: "Markdown" },
  { format: "json", label: "JSON" }
];

export default function ExportMenu({ searchId }: { searchId: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-8 items-center gap-1.5 rounded-lg border border-hairline bg-surface-1 px-3 text-sm text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Download aria-hidden="true" className="size-3.5" />
        내보내기
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          className="panel-highlight absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-hairline bg-surface-3 py-1"
          role="menu"
        >
          {FORMATS.map(({ format, label }) => (
            <a
              className="block px-3 py-1.5 text-sm text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
              download
              href={exportUrl(searchId, format)}
              key={format}
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              {label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
