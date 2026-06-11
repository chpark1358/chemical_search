"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** http LAN 등 navigator.clipboard가 없는 환경을 위한 execCommand 폴백. */
function legacyCopy(value: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

type CopyResult = "idle" | "copied" | "failed";

interface CopyButtonProps {
  /** 클립보드에 복사할 값. */
  value: string;
  /** 접근성 라벨 기준이 되는 항목명(예: "DOI", "공개번호"). */
  label: string;
  /** 복사 성공 시 함께 보여줄 짧은 텍스트(예: "DOI 복사"). 없으면 아이콘만. */
  text?: string;
  className?: string;
}

/**
 * 클립보드 복사 버튼. CompoundCard의 CopyField 패턴에서 추출한 공유 컴포넌트로,
 * navigator.clipboard 우선 + execCommand 폴백, 1.5초 후 상태 초기화를 제공한다.
 */
export default function CopyButton({ value, label, text, className }: CopyButtonProps) {
  const [result, setResult] = useState<CopyResult>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  async function copy() {
    let ok = false;
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(value);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok) ok = legacyCopy(value);
    setResult(ok ? "copied" : "failed");
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setResult("idle"), 1500);
  }

  return (
    <button
      aria-label={result === "failed" ? `${label} 복사 실패` : `${label} 복사`}
      className={
        className ??
        "inline-flex shrink-0 items-center gap-1 rounded p-1 text-ink-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
      }
      onClick={(event) => {
        event.stopPropagation();
        void copy();
      }}
      title={result === "failed" ? "복사 실패" : `${label} 복사`}
      type="button"
    >
      {result === "copied" ? (
        <Check aria-hidden="true" className="size-3 text-success" />
      ) : result === "failed" ? (
        <X aria-hidden="true" className="size-3 text-danger" />
      ) : (
        <Copy aria-hidden="true" className="size-3" />
      )}
      {text ? <span className="text-[11px]">{text}</span> : null}
    </button>
  );
}
