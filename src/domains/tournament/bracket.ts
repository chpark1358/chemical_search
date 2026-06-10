import type { Candidate } from "@/domains/worldcup/types";
import type { BracketState, MatchState } from "@/domains/play-session/types";

function hashText(value: string) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle<T>(items: T[], seed: string) {
  const output = [...items];
  let state = hashText(seed) || 1;

  for (let index = output.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }

  return output;
}

function roundLabel(candidateCount: number) {
  return candidateCount === 2 ? "결승" : `${candidateCount}강`;
}

function createMatches(candidateIds: string[], roundSize: number): MatchState[] {
  const label = roundSize === 2 ? "final" : `r${roundSize}`;
  const matches: MatchState[] = [];

  for (let index = 0; index < candidateIds.length; index += 2) {
    matches.push({
      id: `${label}-m${index / 2 + 1}`,
      leftCandidateId: candidateIds[index],
      rightCandidateId: candidateIds[index + 1],
      winnerCandidateId: null,
      status: "pending"
    });
  }

  return matches;
}

export function createBracket({
  candidates,
  selectedRound,
  seed,
  mode
}: {
  candidates: Candidate[];
  selectedRound: number;
  seed: string;
  mode: "sample" | "all-candidates";
}): BracketState {
  const shuffledCandidates = seededShuffle(candidates, seed).slice(0, selectedRound);
  const candidateIds = shuffledCandidates.map((candidate) => candidate.id);

  return {
    seed,
    mode,
    selectedRound,
    rounds: [
      {
        label: roundLabel(selectedRound),
        matches: createMatches(candidateIds, selectedRound)
      }
    ],
    current: {
      roundIndex: 0,
      matchIndex: 0
    },
    eliminatedCandidateIds: []
  };
}

export function currentMatch(bracket: BracketState) {
  return bracket.rounds[bracket.current.roundIndex]?.matches[bracket.current.matchIndex] ?? null;
}

export function resolveCurrentMatch(bracket: BracketState, winnerCandidateId: string) {
  const round = bracket.rounds[bracket.current.roundIndex];
  const match = currentMatch(bracket);

  if (!round || !match) {
    return;
  }

  match.winnerCandidateId = winnerCandidateId;
  match.status = "resolved";
  const loserCandidateId =
    match.leftCandidateId === winnerCandidateId ? match.rightCandidateId : match.leftCandidateId;
  bracket.eliminatedCandidateIds.push(loserCandidateId);

  const nextMatchIndex = bracket.current.matchIndex + 1;
  if (round.matches[nextMatchIndex]) {
    bracket.current.matchIndex = nextMatchIndex;
    return;
  }

  const winners = round.matches
    .map((candidateMatch) => candidateMatch.winnerCandidateId)
    .filter((candidateId): candidateId is string => Boolean(candidateId));

  if (winners.length === 1) {
    return;
  }

  const nextRoundSize = winners.length;
  bracket.rounds.push({
    label: roundLabel(nextRoundSize),
    matches: createMatches(winners, nextRoundSize)
  });
  bracket.current.roundIndex += 1;
  bracket.current.matchIndex = 0;
}
