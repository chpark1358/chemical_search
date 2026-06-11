"use client";

import { useEffect } from "react";

import type { Candidate } from "@/lib/api";

import { isTypingTarget } from "./keyboard";

interface CandidatePickerProps {
  candidates: Candidate[];
  onSelect: (candidateId: string) => void;
}

function candidateMeta(candidate: Candidate): string {
  return [
    candidate.formula,
    candidate.cid !== null ? `CID ${candidate.cid}` : null,
    candidate.smiles
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function CandidatePicker({ candidates, onSelect }: CandidatePickerProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = Number.parseInt(event.key, 10);
      if (Number.isNaN(index) || index < 1 || index > Math.min(candidates.length, 9)) {
        return;
      }
      event.preventDefault();
      const candidate = candidates[index - 1];
      if (candidate) onSelect(candidate.candidate_id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [candidates, onSelect]);

  return (
    <section className="panel-highlight overflow-hidden rounded-xl border border-hairline bg-surface-1">
      <header className="border-b border-hairline px-4 py-3">
        <h2 className="text-sm font-semibold tracking-[-0.02em] text-ink">
          화합물 후보를 선택하세요
        </h2>
        <p className="mt-0.5 text-xs text-ink-subtle">
          입력이 여러 구조와 일치합니다. 행을 클릭하거나 숫자 키로 선택할 수 있습니다.
        </p>
      </header>
      <ul className="divide-y divide-hairline">
        {candidates.map((candidate, index) => (
          <li key={candidate.candidate_id}>
            <button
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-surface-2"
              onClick={() => onSelect(candidate.candidate_id)}
              type="button"
            >
              <kbd
                aria-hidden="true"
                className="flex size-5 shrink-0 items-center justify-center rounded border border-hairline bg-surface-2 font-mono text-[11px] text-ink-subtle"
              >
                {index < 9 ? index + 1 : "·"}
              </kbd>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {candidate.title}
                </span>
                <span className="mt-0.5 block truncate font-mono text-xs text-ink-subtle">
                  {candidateMeta(candidate)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="border-t border-hairline px-4 py-2 font-mono text-[11px] text-ink-tertiary">
        1-9 선택
      </p>
    </section>
  );
}
