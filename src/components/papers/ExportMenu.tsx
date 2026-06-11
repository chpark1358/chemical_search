"use client";

import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { exportUrl, type ExportFormat, type Paper, type Patent } from "@/lib/api";
import {
  exportPapers,
  exportPatents,
  type ClientFormat,
  type PatentClientFormat
} from "@/lib/exporters";

/** 논문 내보내기 포맷(서버 라우트는 csv/markdown/json만, BibTeX/RIS는 클라이언트 전용). */
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

type ExportMode = "all" | "selected";

interface ExportMenuProps {
  searchId: string;
  kind: "papers" | "patents";
  /** 현재 보이는(필터·정렬 적용 후) 전체 항목. 클라이언트 내보내기 대상이 된다. */
  papers?: Paper[];
  patents?: Patent[];
  /** 선택된 항목(선택 모드에서 내보낼 대상). 비어 있으면 선택 모드를 숨긴다. */
  selectedPapers?: Paper[];
  selectedPatents?: Patent[];
}

/** 서버 라우트가 존재하는 포맷만 전체 리포트 다운로드에 서버 URL을 쓴다. */
const SERVER_FORMATS = new Set<string>(["csv", "markdown", "json"]);

export default function ExportMenu({
  searchId,
  kind,
  papers = [],
  patents = [],
  selectedPapers = [],
  selectedPatents = []
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ExportMode>("all");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedCount = kind === "papers" ? selectedPapers.length : selectedPatents.length;
  const hasSelection = selectedCount > 0;
  // 선택이 없으면 강제로 전체 모드(상태가 'selected'여도 파생적으로 무시).
  const isSelectedMode = mode === "selected" && hasSelection;

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
    const items = isSelectedMode ? selectedPapers : papers;
    // 전체 모드 + 서버 지원 포맷이면 서버 리포트(원본 전체)를 우선 사용한다.
    if (!isSelectedMode && SERVER_FORMATS.has(format)) {
      triggerServerDownload(searchId, format as ExportFormat);
      return;
    }
    exportPapers(items, format, isSelectedMode ? "papers-selected" : "papers");
  }

  function handlePatentExport(format: PatentClientFormat) {
    setOpen(false);
    const items = isSelectedMode ? selectedPatents : patents;
    if (!isSelectedMode && SERVER_FORMATS.has(format)) {
      triggerServerDownload(searchId, format as ExportFormat);
      return;
    }
    exportPatents(items, format, isSelectedMode ? "patents-selected" : "patents");
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-8 items-center gap-1.5 rounded-lg border border-hairline bg-surface-1 px-3 text-sm text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
        data-testid="export-menu-trigger"
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
          {hasSelection ? (
            <div
              aria-label="내보내기 범위"
              className="flex items-center gap-1 px-2 pb-1"
              role="group"
            >
              <button
                aria-pressed={mode === "all"}
                className={`flex-1 rounded-md px-2 py-1 text-xs transition-colors duration-150 ${
                  mode === "all"
                    ? "bg-primary text-ink"
                    : "text-ink-subtle hover:bg-surface-2 hover:text-ink"
                }`}
                onClick={() => setMode("all")}
                type="button"
              >
                전체
              </button>
              <button
                aria-pressed={mode === "selected"}
                className={`flex-1 rounded-md px-2 py-1 text-xs transition-colors duration-150 ${
                  mode === "selected"
                    ? "bg-primary text-ink"
                    : "text-ink-subtle hover:bg-surface-2 hover:text-ink"
                }`}
                data-testid="export-selected-mode"
                onClick={() => setMode("selected")}
                type="button"
              >
                선택 항목만 ({selectedCount})
              </button>
            </div>
          ) : null}
          {kind === "papers"
            ? PAPER_FORMATS.map(({ format, label }) => (
                <button
                  className="block w-full px-3 py-1.5 text-left text-sm text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
                  data-testid={`export-format-${format}`}
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
                  data-testid={`export-format-${format}`}
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

/** 서버 내보내기 라우트를 임시 앵커로 트리거한다(전체 리포트 다운로드). */
function triggerServerDownload(searchId: string, format: ExportFormat) {
  const anchor = document.createElement("a");
  anchor.href = exportUrl(searchId, format);
  anchor.download = "";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
