"use client";

import { Star } from "lucide-react";

/**
 * 저장(즐겨찾기) 토글 버튼. 저장된 상태면 라벤더(primary) 채움 별,
 * 아니면 외곽선 별을 보여준다. 행 클릭/키보드 선택을 트리거하지 않게 전파를 막는다.
 */
interface StarButtonProps {
  saved: boolean;
  onToggle: () => void;
  /** 접근성 라벨 기준 항목명(예: 논문/특허 제목). */
  label: string;
  /** 레이아웃용 클래스(여백/정렬 등). 색상/상태 스타일은 컴포넌트가 항상 적용한다. */
  className?: string;
}

const BASE_CLASS = "shrink-0 rounded-md p-1 transition-colors duration-150";

export default function StarButton({
  saved,
  onToggle,
  label,
  className = "mt-0.5"
}: StarButtonProps) {
  const toneClass = saved
    ? "text-primary hover:text-primary-hover"
    : "text-ink-tertiary hover:bg-surface-3 hover:text-ink-subtle";
  return (
    <button
      aria-label={saved ? `저장 해제: ${label}` : `저장: ${label}`}
      aria-pressed={saved}
      className={`${className} ${BASE_CLASS} ${toneClass}`}
      data-testid="star-toggle"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      title={saved ? "저장 해제" : "저장"}
      type="button"
    >
      <Star aria-hidden="true" className={`size-4 ${saved ? "fill-primary" : ""}`} />
    </button>
  );
}
