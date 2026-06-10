"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CandidateChoice } from "@/components/play/CandidateChoice";
import type { Candidate } from "@/domains/worldcup/types";
import { routes } from "@/lib/routes";

type ApiCandidateMatch = {
  id: string;
  leftCandidateId: string;
  rightCandidateId: string;
  leftCandidate: Candidate;
  rightCandidate: Candidate;
};

type ApiPlaySession = {
  id: string;
  worldCupSlug: string;
  selectedRound: number;
  status: "active" | "completed";
  winnerCandidateId: string | null;
  currentMatch: ApiCandidateMatch | null;
  bracket: {
    current: {
      roundIndex: number;
      matchIndex: number;
    };
    rounds: Array<{
      label: string;
      matches: Array<{ id: string; status: "pending" | "resolved" }>;
    }>;
  };
};

type ApiResponse<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

type Props = {
  slug: string;
  title: string;
  selectedRound: number;
};

export function PlayExperience({ slug, title, selectedRound }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<ApiPlaySession | null>(null);
  const [clientSequence, setClientSequence] = useState(1);
  const [status, setStatus] = useState<"loading" | "playing" | "submitting" | "failed">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function createSession() {
      setStatus("loading");
      setErrorMessage(null);

      const response = await fetch(`/api/worldcups/${slug}/play-sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          selectedRound,
          mode: "sample",
          clientSessionKey: `${slug}-${Date.now()}`
        })
      });
      const payload = (await response.json()) as ApiResponse<ApiPlaySession>;

      if (!active) {
        return;
      }

      if (!payload.ok) {
        setErrorMessage(payload.error.message);
        setStatus("failed");
        return;
      }

      setSession(payload.data);
      setStatus("playing");
    }

    createSession().catch(() => {
      if (active) {
        setErrorMessage("플레이 세션을 만들지 못했습니다.");
        setStatus("failed");
      }
    });

    return () => {
      active = false;
    };
  }, [selectedRound, slug]);

  const progressPercent = useMemo(() => {
    if (!session) {
      return 0;
    }

    const resolved = session.bracket.rounds.reduce(
      (total, round) => total + round.matches.filter((match) => match.status === "resolved").length,
      0
    );
    const total = Math.max(1, session.selectedRound - 1);
    return Math.min(100, Math.round((resolved / total) * 100));
  }, [session]);

  async function choose(winner: Candidate, loser: Candidate) {
    if (!session?.currentMatch || status === "submitting") {
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);

    const response = await fetch(`/api/play-sessions/${session.id}/select`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        matchId: session.currentMatch.id,
        winnerCandidateId: winner.id,
        loserCandidateId: loser.id,
        elapsedMs: 1200,
        clientSequence
      })
    });

    const payload = (await response.json()) as ApiResponse<{
      session: ApiPlaySession;
      idempotent: boolean;
    }>;

    if (!payload.ok) {
      setErrorMessage(payload.error.message);
      setStatus("playing");
      return;
    }

    setClientSequence((value) => value + 1);
    setSession(payload.data.session);

    if (payload.data.session.status === "completed") {
      router.push(routes.worldCupResult(slug, payload.data.session.id));
      return;
    }

    setStatus("playing");
  }

  if (status === "loading" || !session) {
    return (
      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6">
        <p className="font-bold">플레이 세션을 준비하고 있습니다.</p>
        <p className="mt-2 text-sm text-[var(--muted)]">라운드와 후보 순서를 생성하는 중입니다.</p>
      </div>
    );
  }

  if (status === "failed" || !session.currentMatch) {
    return (
      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6">
        <p className="font-bold">플레이를 시작할 수 없습니다.</p>
        <p className="mt-2 text-sm text-[var(--muted)]">{errorMessage ?? "다시 시도해주세요."}</p>
        <Link
          href={routes.worldCupDetail(slug)}
          className="focus-ring mt-4 inline-flex rounded-md bg-[var(--brand)] px-4 py-2 font-bold text-white"
        >
          상세로 돌아가기
        </Link>
      </div>
    );
  }

  const { leftCandidate, rightCandidate } = session.currentMatch;
  const inputLocked = status === "submitting";

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[var(--accent)]">
            {session.bracket.rounds[session.bracket.current.roundIndex]?.label}{" "}
            {session.bracket.current.matchIndex + 1}경기
          </p>
          <h1 className="text-2xl font-black">{title}</h1>
        </div>
        <Link
          href={routes.worldCupDetail(slug)}
          className="focus-ring rounded-md border border-[var(--line)] bg-white px-4 py-2 text-sm font-bold"
        >
          나가기
        </Link>
      </div>
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-[#e4dfd4]">
        <div className="h-full bg-[var(--brand)]" style={{ width: `${progressPercent}%` }} />
      </div>
      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {errorMessage}
        </div>
      ) : null}
      <div
        className={`grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch ${
          inputLocked ? "pointer-events-none opacity-70" : ""
        }`}
      >
        <CandidateChoice
          candidate={leftCandidate}
          side="left"
          disabled={inputLocked}
          onSelect={() => choose(leftCandidate, rightCandidate)}
        />
        <div className="flex items-center justify-center text-sm font-black text-[var(--muted)]">VS</div>
        <CandidateChoice
          candidate={rightCandidate}
          side="right"
          disabled={inputLocked}
          onSelect={() => choose(rightCandidate, leftCandidate)}
        />
      </div>
      <div className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
        {inputLocked
          ? "선택을 기록하고 다음 매치를 준비하는 중입니다."
          : "후보 카드를 선택하면 서버 API에 선택을 기록하고 다음 매치로 이동합니다."}
      </div>
    </>
  );
}
