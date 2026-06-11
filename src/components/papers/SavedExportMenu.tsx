"use client";

import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Paper, Patent } from "@/lib/api";
import {
  exportPapers,
  exportPatents,
  exportXlsx,
  type ClientFormat,
  type PatentClientFormat
} from "@/lib/exporters";

/**
 * 저장됨 라이브러리 전용 내보내기 메뉴. 서버 search_id가 없으므로 항상
 * 클라이언트 측 exporters를 사용한다. 논문은 CSV/MD/JSON/BibTeX/RIS,
 * 특허는 CSV/MD/JSON을 지원한다.
 */
const PAPER_FORMATS: ReadonlyArray<{ format: ClientFormat; label: string }> = [
  { format: "csv", label: "CSV (.csv)" },
  { format: "markdown", label: "Markdown (.md)" },
  { format: "json", label: "JSON (.json)" },
  { format: "bibtex", label: "BibTeX (.bib)" },
  { format: "ris", label: "RIS (.ris)" }
];

const PATENT_FORMATS: ReadonlyArray<{ format: PatentClientFormat; label: string }> = [
  { format: "csv", label: "CSV (.csv)" },
  { format: "markdown", label: "Markdown (.md)" },
  { format: "json", label: "JSON (.json)" }
];

interface SavedExportMenuProps {
  kind: "papers" | "patents";
  /** 내보낼 항목(선택이 있으면 선택, 없으면 전체). */
  papers?: Paper[];
  patents?: Patent[];
  /** 비활성(내보낼 항목 0건)이면 버튼을 비활성화한다. */
  disabled?: boolean;
}

export default function SavedExportMenu({
  kind,
  papers = [],
  patents = [],
  disabled = false
}: SavedExportMenuProps) {
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

  function handlePaperExport(format: ClientFormat) {
    setOpen(false);
    exportPapers(papers, format, "saved-papers");
  }

  function handlePatentExport(format: PatentClientFormat) {
    setOpen(false);
    exportPatents(patents, format, "saved-patents");
  }

  function handleXlsxExport() {
    setOpen(false);
    if (kind === "papers") {
      void exportXlsx({ papers, filenameBase: "saved-papers" });
    } else {
      void exportXlsx({ patents, filenameBase: "saved-patents" });
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-8 items-center gap-1.5 rounded-lg border border-hairline bg-surface-1 px-3 text-sm text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="saved-export-trigger"
        disabled={disabled}
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
          className="panel-highlight absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-hairline bg-surface-3 py-1"
          role="menu"
        >
          <button
            className="block w-full px-3 py-1.5 text-left text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-2"
            data-testid="saved-export-xlsx"
            onClick={handleXlsxExport}
            role="menuitem"
            type="button"
          >
            Excel (.xlsx)
          </button>
          {kind === "papers"
            ? PAPER_FORMATS.map(({ format, label }) => (
                <button
                  className="block w-full px-3 py-1.5 text-left text-sm text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
                  data-testid={`saved-export-${format}`}
                  key={format}
                  onClick={() => handlePaperExport(format)}
                  role="menuitem"
                  type="button"
                >
                  {label}
                </button>
              ))
            : PATENT_FORMATS.map(({ format, label }) => (
                <button
                  className="block w-full px-3 py-1.5 text-left text-sm text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
                  data-testid={`saved-export-${format}`}
                  key={format}
                  onClick={() => handlePatentExport(format)}
                  role="menuitem"
                  type="button"
                >
                  {label}
                </button>
              ))}
        </div>
      ) : null}
    </div>
  );
}
