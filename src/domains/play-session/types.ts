import type { Candidate } from "@/domains/worldcup/types";

export type MatchState = {
  id: string;
  leftCandidateId: string;
  rightCandidateId: string;
  winnerCandidateId: string | null;
  status: "pending" | "resolved";
};

export type RoundState = {
  label: string;
  matches: MatchState[];
};

export type BracketState = {
  seed: string;
  mode: "sample" | "all-candidates";
  selectedRound: number;
  rounds: RoundState[];
  current: {
    roundIndex: number;
    matchIndex: number;
  };
  eliminatedCandidateIds: string[];
};

export type PlaySession = {
  id: string;
  worldCupSlug: string;
  selectedRound: number;
  status: "active" | "completed";
  winnerCandidateId: string | null;
  bracket: BracketState;
  candidates: Candidate[];
  processedClientSequences: Set<number>;
  createdAt: string;
  updatedAt: string;
};
