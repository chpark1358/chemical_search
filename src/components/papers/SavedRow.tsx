"use client";

import { ExternalLink, X } from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent } from "react";

import { isSafeUrl, type Paper, type Patent } from "@/lib/api";
import {
  isSavedPaper,
  updateSaved,
  type SavedItem
} from "@/lib/savedItems";

import SelectCheckbox from "./SelectCheckbox";

interface SavedRowProps {
  item: SavedItem;
  checked: boolean;
  onToggleCheck: () => void;
  onRemove: () => void;
}

/** 논문/특허 공통 원문 링크를 안전하게 뽑는다. */
function sourceUrl(item: SavedItem): string | null {
  const url = (item.data as Paper | Patent).url;
  return isSafeUrl(url) ? url : null;
}

/** 출처 메타 라인(논문: 저널·연도 / 특허: 공개번호·출원인). */
function metaLine(item: SavedItem): string {
  if (isSavedPaper(item)) {
    const paper = item.data;
    const parts = [
      paper.authors.length ? paper.authors.slice(0, 3).join(", ") : null,
      paper.venue,
      paper.year !== null ? String(paper.year) : null
    ].filter((part): part is string => Boolean(part));
    return parts.join(" · ");
  }
  const patent = item.data as Patent;
  const parts = [patent.publication_number, patent.assignee, patent.date].filter(
    (part): part is string => Boolean(part)
  );
  return parts.join(" · ");
}

export default function SavedRow({
  item,
  checked,
  onToggleCheck,
  onRemove
}: SavedRowProps) {
  // 로컬 편집 버퍼. localStorage 갱신은 입력마다 즉시 일어난다(autosave).
  const [customTitle, setCustomTitle] = useState(item.customTitle ?? "");
  const [memo, setMemo] = useState(item.memo);
  const [tagDraft, setTagDraft] = useState("");

  // 외부(다른 탭/뷰)에서 같은 항목 값이 바뀌면 편집 버퍼를 렌더 중 동기화한다.
  // (effect 대신 "prop 변경 시 state 조정" 패턴 — 입력 중 내 편집은 prevProp 비교로 보존된다.)
  const [prevSnapshot, setPrevSnapshot] = useState({
    customTitle: item.customTitle ?? "",
    memo: item.memo
  });
  if (
    prevSnapshot.customTitle !== (item.customTitle ?? "") ||
    prevSnapshot.memo !== item.memo
  ) {
    setPrevSnapshot({ customTitle: item.customTitle ?? "", memo: item.memo });
    setCustomTitle(item.customTitle ?? "");
    setMemo(item.memo);
  }

  const url = sourceUrl(item);
  const displayTitle = (item.customTitle?.trim() || item.title).trim();
  const hasCustomTitle = Boolean(item.customTitle?.trim());

  function commitCustomTitle(value: string) {
    setCustomTitle(value);
    updateSaved(item.key, { customTitle: value.trim() || undefined });
  }

  function commitMemo(value: string) {
    setMemo(value);
    updateSaved(item.key, { memo: value });
  }

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    if (item.tags.includes(tag)) {
      setTagDraft("");
      return;
    }
    updateSaved(item.key, { tags: [...item.tags, tag] });
    setTagDraft("");
  }

  function removeTag(tag: string) {
    updateSaved(item.key, { tags: item.tags.filter((value) => value !== tag) });
  }

  function onTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagDraft);
    }
  }

  return (
    <article className="px-4 py-3" data-testid="saved-row">
      <div className="flex items-start gap-3">
        <SelectCheckbox
          checked={checked}
          label={`저장 항목 선택: ${displayTitle}`}
          onChange={onToggleCheck}
        />
        <div className="min-w-0 flex-1">
          {url ? (
            <a
              className="text-sm font-medium leading-snug text-ink transition-colors duration-150 hover:text-primary-hover"
              href={url}
              rel="noreferrer"
              target="_blank"
            >
              {displayTitle}
              <ExternalLink
                aria-hidden="true"
                className="ml-1.5 inline size-3 align-[-1px] text-ink-tertiary"
              />
            </a>
          ) : (
            <span className="text-sm font-medium leading-snug text-ink">
              {displayTitle}
            </span>
          )}
          {hasCustomTitle ? (
            <p className="mt-0.5 truncate text-[11px] text-ink-tertiary">
              원제목: {item.title}
            </p>
          ) : null}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-ink-tertiary">
            {metaLine(item) ? <span>{metaLine(item)}</span> : null}
            {item.compoundName ? (
              <span className="rounded-full border border-hairline px-2 py-px text-ink-subtle">
                {item.compoundName}
              </span>
            ) : null}
          </p>

          {/* 인라인 편집: 커스텀 제목 + 메모(둘 다 입력 즉시 autosave). */}
          <div className="mt-2 flex flex-col gap-1.5">
            <input
              aria-label="제목 편집"
              className="h-8 w-full rounded-lg border border-hairline bg-surface-2 px-2.5 text-sm text-ink transition-colors duration-150 placeholder:text-ink-tertiary hover:border-hairline-strong focus:border-hairline-strong focus:outline-2 focus:outline-primary/50"
              data-testid="saved-custom-title"
              onChange={(event) => commitCustomTitle(event.target.value)}
              placeholder="제목(미입력 시 원제목 사용)"
              type="text"
              value={customTitle}
            />
            <textarea
              aria-label="메모 편집"
              className="min-h-[2.25rem] w-full resize-y rounded-lg border border-hairline bg-surface-2 px-2.5 py-1.5 text-sm leading-5 text-ink transition-colors duration-150 placeholder:text-ink-tertiary hover:border-hairline-strong focus:border-hairline-strong focus:outline-2 focus:outline-primary/50"
              data-testid="saved-memo"
              onChange={(event) => commitMemo(event.target.value)}
              placeholder="메모"
              rows={2}
              value={memo}
            />
          </div>

          {/* 태그 칩 + 추가 입력. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {item.tags.map((tag) => (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 py-px text-[11px] text-ink-subtle"
                data-testid="saved-tag"
                key={tag}
              >
                {tag}
                <button
                  aria-label={`태그 삭제: ${tag}`}
                  className="rounded p-0.5 text-ink-tertiary transition-colors duration-150 hover:text-ink"
                  onClick={() => removeTag(tag)}
                  type="button"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </span>
            ))}
            <input
              aria-label="태그 추가"
              className="h-7 w-28 rounded-full border border-hairline bg-surface-2 px-2.5 text-[11px] text-ink transition-colors duration-150 placeholder:text-ink-tertiary hover:border-hairline-strong focus:border-hairline-strong focus:outline-2 focus:outline-primary/50"
              data-testid="saved-tag-input"
              onBlur={() => addTag(tagDraft)}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={onTagKeyDown}
              placeholder="+ 태그"
              type="text"
              value={tagDraft}
            />
          </div>
        </div>
        <button
          aria-label={`저장 해제: ${displayTitle}`}
          className="ml-auto mt-0.5 shrink-0 rounded-md p-1 text-ink-tertiary transition-colors duration-150 hover:bg-surface-3 hover:text-danger"
          data-testid="saved-unsave"
          onClick={onRemove}
          title="저장 해제"
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </article>
  );
}
