"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";

import { isSafeUrl, type Patent } from "@/lib/api";

import CopyButton from "./CopyButton";
import { providerLabel } from "./ProviderChips";
import SelectCheckbox from "./SelectCheckbox";

interface PatentRowProps {
  patent: Patent;
  selected: boolean;
  onSelect: () => void;
  /** 다중 선택 체크 상태와 토글 핸들러. */
  checked: boolean;
  onToggleCheck: () => void;
}

/**
 * 외부 링크 호스트로 명시적 라벨을 만든다("KIPRIS에서 보기" / "Google Patents에서 보기").
 * KIPRIS 특허는 Google Patents 또는 KIPRIS 링크를 가질 수 있어 호스트 기반 분기가 필요하다.
 * 알 수 없으면 일반 라벨("특허 원문 보기")을 반환한다.
 */
function externalLinkLabel(url: string | null): string {
  if (!url) return "특허 원문 보기";
  try {
    const host = new URL(url).hostname;
    if (host.includes("patents.google.com")) return "Google Patents에서 보기";
    if (host.includes("kipris.or.kr")) return "KIPRIS에서 보기";
  } catch {
    return "특허 원문 보기";
  }
  return "특허 원문 보기";
}

export default function PatentRow({
  patent,
  selected,
  onSelect,
  checked,
  onToggleCheck
}: PatentRowProps) {
  const rowRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const safeUrl = isSafeUrl(patent.url) ? patent.url : null;
  const linkLabel = externalLinkLabel(safeUrl);

  return (
    <article
      // scroll-mt는 스티키 헤더+검색바(~120px) 아래로 행이 숨지 않게 한다.
      className={`group/row relative scroll-mb-4 scroll-mt-[120px] px-4 py-3 transition-colors duration-150 ${
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
          label={`특허 선택: ${patent.title}`}
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
            {patent.title}
            <ExternalLink
              aria-hidden="true"
              className="ml-1.5 inline size-3 align-[-1px] text-ink-tertiary"
            />
          </a>
        ) : (
          <span className="text-sm font-medium leading-snug text-ink">
            {patent.title}
          </span>
        )}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-ink-tertiary">
          <span className="inline-flex items-center gap-1">
            <span className="max-w-72 truncate">{patent.publication_number}</span>
            {/* 호버 시 노출되는 복사 버튼(공개번호). 포커스 시에도 보이게 한다. */}
            <span className="opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100">
              <CopyButton
                className="inline-flex shrink-0 items-center rounded p-0.5 text-ink-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-ink"
                label="공개번호"
                value={patent.publication_number}
              />
            </span>
          </span>
          {patent.assignee ? (
            <span className="inline-flex items-center gap-1">
              <span className="max-w-72 truncate">{patent.assignee}</span>
              <span className="opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100">
                <CopyButton
                  className="inline-flex shrink-0 items-center rounded p-0.5 text-ink-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-ink"
                  label="출원인"
                  value={patent.assignee}
                />
              </span>
            </span>
          ) : null}
          {patent.date ? <span>{patent.date}</span> : null}
          {/* 출처 배지(데이터 소스). 링크 호스트 라벨과 중복되지 않도록 링크는 별도 라벨로 둔다. */}
          <span className="rounded-full border border-hairline px-2 py-px text-ink-subtle">
            {providerLabel(patent.source)}
          </span>
          {safeUrl ? (
            <a
              className="rounded-full border border-hairline px-2 py-px text-ink-subtle transition-colors duration-150 hover:border-hairline-strong hover:text-ink-muted"
              href={safeUrl}
              onClick={(event) => event.stopPropagation()}
              rel="noreferrer"
              target="_blank"
            >
              {linkLabel}
            </a>
          ) : null}
        </p>
        </div>
      </div>
    </article>
  );
}
