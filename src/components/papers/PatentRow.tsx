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

/** 외부 링크 호스트로 출처 라벨을 추정한다. 알 수 없으면 일반 라벨을 반환한다. */
function externalLinkLabel(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    if (host.includes("patents.google.com")) return "Google Patents";
    if (host.includes("kipris.or.kr")) return "KIPRIS";
  } catch {
    return "특허 보기";
  }
  return "특허 보기";
}

export default function PatentRow({ patent, selected, onSelect }: PatentRowProps) {
  const rowRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const safeUrl = isSafeUrl(patent.url) ? patent.url : null;
  // 외부 링크 라벨: URL 호스트로 출처를 추정한다(Google Patents / KIPRIS),
  // 알 수 없으면 일반 라벨("특허 보기")을 쓴다. KIPRIS 특허는 Google Patents 또는
  // KIPRIS 링크를 가질 수 있으므로 호스트 기반 분기가 필요하다.
  const linkLabel = externalLinkLabel(safeUrl);
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
          {linkLabel ? (
            <span className="rounded-full border border-hairline px-2 py-px text-ink-subtle">
              {linkLabel}
            </span>
          ) : null}
        </p>
      </div>
    </article>
  );
}
