"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { isSafeUrl, type Paper, type PaperSourceName } from "@/lib/api";
import { toBibTeX } from "@/lib/citation";
import type { FoldedPaper } from "@/lib/papers";
import { highlightTerm, sanitizeAbstract } from "@/lib/text";

import CopyButton from "./CopyButton";
import { providerLabel } from "./ProviderChips";
import SelectCheckbox from "./SelectCheckbox";
import StarButton from "./StarButton";

/** 인용수가 이 값 이상이면 고인용 논문으로 강조한다. */
const HIGH_CITATION_THRESHOLD = 100;

function authorsLabel(authors: string[]): string {
  if (!authors.length) return "저자 정보 없음";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} 외 ${authors.length - 3}명`;
}

/** 텍스트를 화합물명 기준으로 분할해 일치 구간만 <mark>로 강조한다(HTML 주입 없음). */
function HighlightedText({ text, term }: { text: string; term: string }) {
  const tokens = useMemo(() => highlightTerm(text, term), [text, term]);
  return (
    <>
      {tokens.map((token, index) =>
        token.hit ? (
          <mark
            className="rounded bg-primary/25 px-0.5 text-ink"
            key={`${index}-${token.text}`}
          >
            {token.text}
          </mark>
        ) : (
          <span key={`${index}-${token.text}`}>{token.text}</span>
        )
      )}
    </>
  );
}

interface PaperRowProps {
  paper: FoldedPaper;
  selected: boolean;
  onSelect: () => void;
  /** 강조할 화합물명(있으면 제목/초록에서 <mark>로 표시). */
  highlight?: string;
  /** 다중 선택 체크 상태와 토글 핸들러. */
  checked: boolean;
  onToggleCheck: () => void;
  /** 저장(즐겨찾기) 상태와 토글 핸들러. */
  saved: boolean;
  onToggleSave: () => void;
}

/** 출처 칩에 표시할 라벨(대표 출처를 제외한 추가 출처들). */
function extraSources(sources: PaperSourceName[], primary: PaperSourceName): string[] {
  return sources.filter((source) => source !== primary).map(providerLabel);
}

export default function PaperRow({
  paper,
  selected,
  onSelect,
  highlight = "",
  checked,
  onToggleCheck,
  saved,
  onToggleSave
}: PaperRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const rowRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const safeUrl = isSafeUrl(paper.url) ? paper.url : null;
  const cleanAbstract = useMemo(() => sanitizeAbstract(paper.abstract), [paper.abstract]);
  const isHighCitation =
    paper.citations !== null && paper.citations >= HIGH_CITATION_THRESHOLD;
  const others = extraSources(paper.sources, paper.source);
  const bibtex = useMemo(() => toBibTeX(paper), [paper]);

  return (
    <article
      // scroll-mt는 스티키 헤더+검색바(~113px) 아래로 행이 숨지 않게 한다.
      className={`relative scroll-mb-4 scroll-mt-[120px] px-4 py-3 transition-colors duration-150 ${
        selected ? "bg-surface-2" : "hover:bg-surface-2"
      }`}
      onClick={onSelect}
      ref={rowRef}
    >
      {selected ? (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
      ) : null}
      <div className="flex items-start gap-3">
        <SelectCheckbox
          checked={checked}
          label={`논문 선택: ${paper.title}`}
          onChange={onToggleCheck}
        />
        <div className="min-w-0 flex-1">
          {safeUrl ? (
            <a
              className="text-sm font-medium leading-snug text-ink transition-colors duration-150 hover:text-primary-hover"
              href={safeUrl}
              rel="noreferrer"
              target="_blank"
            >
              <HighlightedText term={highlight} text={paper.title} />
              <ExternalLink
                aria-hidden="true"
                className="ml-1.5 inline size-3 align-[-1px] text-ink-tertiary"
              />
            </a>
          ) : (
            <span className="text-sm font-medium leading-snug text-ink">
              <HighlightedText term={highlight} text={paper.title} />
            </span>
          )}
          <p className="mt-1 truncate text-xs text-ink-subtle">
            {authorsLabel(paper.authors)}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-ink-tertiary">
            {paper.venue ? (
              <span className="max-w-64 truncate">{paper.venue}</span>
            ) : null}
            {paper.year !== null ? <span>{paper.year}</span> : null}
            {paper.citations !== null ? (
              <span className={isHighCitation ? "font-semibold text-success" : undefined}>
                인용 {paper.citations}
              </span>
            ) : null}
            {paper.doi ? (
              <span className="inline-flex items-center gap-1 rounded border border-hairline bg-surface-2 px-1.5 py-px">
                DOI {paper.doi}
                <CopyButton
                  className="inline-flex shrink-0 items-center gap-1 rounded p-0.5 text-ink-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-ink"
                  label="DOI"
                  value={paper.doi}
                />
              </span>
            ) : null}
            <span className="rounded-full border border-hairline px-2 py-px text-ink-subtle">
              {providerLabel(paper.source)}
            </span>
            {others.length ? (
              <button
                aria-expanded={showSources}
                aria-label={`다른 출처 ${others.length}곳에서도 발견됨: ${others.join(", ")}`}
                className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-px text-ink-subtle transition-colors duration-150 hover:border-primary hover:text-ink"
                data-testid="source-fold-chip"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowSources((value) => !value);
                }}
                type="button"
              >
                +{others.length} 출처
              </button>
            ) : null}
            <CopyButton
              className="inline-flex shrink-0 items-center gap-1 rounded border border-hairline bg-surface-2 px-1.5 py-px text-ink-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-ink"
              label="BibTeX"
              text="BibTeX 복사"
              value={bibtex}
            />
          </p>
          {others.length && showSources ? (
            <p
              className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-ink-tertiary"
              data-testid="source-fold-list"
            >
              <span className="text-ink-subtle">발견된 출처:</span>
              {paper.sources.map((source) => (
                <span
                  className="rounded-full border border-hairline px-2 py-px text-ink-subtle"
                  key={source}
                >
                  {providerLabel(source)}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 items-start gap-0.5">
          <StarButton label={paper.title} onToggle={onToggleSave} saved={saved} />
          {cleanAbstract ? (
            <button
              aria-expanded={expanded}
              aria-label={expanded ? "초록 접기" : "초록 펼치기"}
              className="mt-0.5 shrink-0 rounded-md p-1 text-ink-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-ink"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((value) => !value);
              }}
              type="button"
            >
              <ChevronDown
                aria-hidden="true"
                className={`size-4 transition-transform duration-150 ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </button>
          ) : null}
        </div>
      </div>
      {cleanAbstract ? (
        <div className="mt-2 border-t border-hairline pt-2">
          <p
            className={`text-xs leading-5 text-ink-muted ${expanded ? "" : "line-clamp-3"}`}
          >
            <HighlightedText term={highlight} text={cleanAbstract} />
          </p>
          <button
            className="mt-1 text-[11px] text-ink-subtle transition-colors duration-150 hover:text-ink"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((value) => !value);
            }}
            type="button"
          >
            {expanded ? "접기" : "더 보기"}
          </button>
        </div>
      ) : null}
    </article>
  );
}
