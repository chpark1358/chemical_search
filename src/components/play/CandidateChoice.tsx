import type { Candidate } from "@/domains/worldcup/types";

type Props = {
  candidate: Candidate;
  side: "left" | "right";
  disabled?: boolean;
  onSelect?: () => void;
};

export function CandidateChoice({ candidate, side, disabled = false, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="focus-ring grid min-h-[280px] w-full grid-rows-[1fr_auto] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      aria-label={`${side === "left" ? "왼쪽" : "오른쪽"} 후보 ${candidate.name} 선택`}
    >
      <div
        className="flex min-h-48 items-center justify-center p-6 text-3xl font-black text-white"
        style={{ background: candidate.color }}
      >
        {candidate.name}
      </div>
      <div className="space-y-2 p-4">
        <p className="text-xs font-bold text-[var(--muted)]">
          {side === "left" ? "왼쪽 후보" : "오른쪽 후보"}
        </p>
        <h2 className="line-clamp-2 text-xl font-bold">{candidate.name}</h2>
        <p className="line-clamp-2 text-sm text-[var(--muted)]">{candidate.description}</p>
      </div>
    </button>
  );
}
