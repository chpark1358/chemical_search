import { randomUUID } from "crypto";
import { createBracket, currentMatch, resolveCurrentMatch } from "@/domains/tournament/bracket";
import { availableRounds } from "@/domains/tournament/rounds";
import { buildCandidates, featuredWorldCup, worldCupCards } from "./mock-data";
import type { WorldCupDetail } from "./types";
import type { PlaySession } from "@/domains/play-session/types";

type WorldCupStoreState = {
  worldcups: Map<string, WorldCupDetail>;
  playSessions: Map<string, PlaySession>;
};

const globalStore = globalThis as typeof globalThis & {
  __idealWorldcupStore?: WorldCupStoreState;
};

function buildWorldcupStore() {
  return new Map<string, WorldCupDetail>(
    worldCupCards.map((card) => [
      card.slug,
      {
        ...featuredWorldCup,
        ...card,
        candidates: buildCandidates(card.candidateCount),
        rankings: featuredWorldCup.rankings
      }
    ])
  );
}

const store =
  globalStore.__idealWorldcupStore ??
  (globalStore.__idealWorldcupStore = {
    worldcups: buildWorldcupStore(),
    playSessions: new Map<string, PlaySession>()
  });

const { worldcups, playSessions } = store;

export function listWorldcups({
  q,
  category,
  sort = "popular",
  limit = 24
}: {
  q?: string;
  category?: string;
  sort?: "popular" | "latest" | "completionRate";
  limit?: number;
}) {
  let items = [...worldcups.values()];

  if (q) {
    const normalizedQuery = q.toLowerCase();
    items = items.filter((worldCup) =>
      `${worldCup.title} ${worldCup.description} ${worldCup.category}`
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }

  if (category) {
    items = items.filter((worldCup) => worldCup.category === category);
  }

  items.sort((a, b) => {
    if (sort === "latest") {
      return b.updatedAt.localeCompare(a.updatedAt);
    }
    if (sort === "completionRate") {
      return b.completionRate - a.completionRate;
    }
    return b.playCount - a.playCount;
  });

  return items.slice(0, limit);
}

export function getWorldcup(slug: string) {
  return worldcups.get(slug) ?? null;
}

export function createPlaySession({
  slug,
  selectedRound,
  mode,
  clientSessionKey
}: {
  slug: string;
  selectedRound: number;
  mode: "sample" | "all-candidates";
  clientSessionKey?: string;
}) {
  const worldCup = getWorldcup(slug);
  if (!worldCup) {
    return { error: "not_found" as const };
  }

  if (!availableRounds(worldCup.candidateCount).includes(selectedRound)) {
    return { error: "round_not_allowed" as const };
  }

  const now = new Date().toISOString();
  const id = `session_${randomUUID()}`;
  const bracket = createBracket({
    candidates: worldCup.candidates,
    selectedRound,
    seed: clientSessionKey ?? id,
    mode
  });

  const session: PlaySession = {
    id,
    worldCupSlug: slug,
    selectedRound,
    status: "active",
    winnerCandidateId: null,
    bracket,
    candidates: worldCup.candidates,
    processedClientSequences: new Set(),
    createdAt: now,
    updatedAt: now
  };

  playSessions.set(id, session);
  return { session };
}

export function getPlaySession(sessionId: string) {
  return playSessions.get(sessionId) ?? null;
}

export function serializePlaySession(session: PlaySession) {
  const match = currentMatch(session.bracket);
  return {
    id: session.id,
    worldCupSlug: session.worldCupSlug,
    selectedRound: session.selectedRound,
    status: session.status,
    winnerCandidateId: session.winnerCandidateId,
    bracket: session.bracket,
    currentMatch: match
      ? {
          ...match,
          leftCandidate: session.candidates.find((candidate) => candidate.id === match.leftCandidateId),
          rightCandidate: session.candidates.find((candidate) => candidate.id === match.rightCandidateId)
        }
      : null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

export function selectMatch({
  sessionId,
  matchId,
  winnerCandidateId,
  loserCandidateId,
  clientSequence
}: {
  sessionId: string;
  matchId: string;
  winnerCandidateId: string;
  loserCandidateId: string;
  clientSequence: number;
}) {
  const session = getPlaySession(sessionId);
  if (!session) {
    return { error: "session_not_found" as const };
  }

  if (session.status === "completed") {
    return { error: "session_completed" as const, session };
  }

  if (session.processedClientSequences.has(clientSequence)) {
    return { session, idempotent: true };
  }

  const match = currentMatch(session.bracket);
  if (!match || match.id !== matchId) {
    return { error: "match_out_of_sync" as const, session };
  }

  if (match.status === "resolved") {
    return { error: "match_already_resolved" as const, session };
  }

  const validCandidatePair = new Set([match.leftCandidateId, match.rightCandidateId]);
  if (!validCandidatePair.has(winnerCandidateId) || !validCandidatePair.has(loserCandidateId)) {
    return { error: "match_out_of_sync" as const, session };
  }

  resolveCurrentMatch(session.bracket, winnerCandidateId);
  session.processedClientSequences.add(clientSequence);
  session.updatedAt = new Date().toISOString();

  const nextMatch = currentMatch(session.bracket);
  if (!nextMatch || nextMatch.status === "resolved") {
    session.status = "completed";
    session.winnerCandidateId = winnerCandidateId;
  }

  return { session };
}
