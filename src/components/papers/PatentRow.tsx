"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";

import { isSafeUrl, type Patent } from "@/lib/api";

import { providerLabel } from "./ProviderChips";

interface PatentRowProps {
  patent: Patent;
  selected: boolean;
  onSelect: () => void;
}

export default function PatentRow({ patent, selected, onSelect }: PatentRowProps) {
  const rowRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const safeUrl = isSafeUrl(patent.url) ? patent.url : null;
  // 모노 메타 라인: 공개번호 · 출원인 · 공개일 (있는 항목만).
  const metaParts = [patent.publication_number, patent.assignee, patent.date].filter(
    (part): part is string => Boolean(part)
  );

  return (
    <article
      // scroll-mt는 스티키 헤더+검색바(~120px) 아래로 행이 숨지 않게 한다.
      className={`relative scroll-mb-4 scroll-mt-[120px] px-4 py-3 transition-colors duration-150 ${
        selected ? "bg-surface-2" : "hover:bg-surface-2"
      }`}
      onClick={onSelect}
      ref={rowRef}
    >
      {selected ? (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
      ) : null}
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
          {metaParts.map((part, index) => (
            <span className="max-w-72 truncate" key={`${part}-${index}`}>
              {part}
            </span>
          ))}
          <span className="rounded-full border border-hairline px-2 py-px text-ink-subtle">
            {providerLabel(patent.source)}
          </span>
          {safeUrl ? (
            <span className="rounded-full border border-hairline px-2 py-px text-ink-subtle">
              Google Patents
            </span>
          ) : null}
        </p>
      </div>
    </article>
  );
}
