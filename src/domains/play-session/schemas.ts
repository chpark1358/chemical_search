import { z } from "zod";

export const createPlaySessionSchema = z.object({
  selectedRound: z.number().int().min(2).max(1024),
  mode: z.enum(["sample", "all-candidates"]).default("sample"),
  clientSessionKey: z.string().min(4).max(128).optional()
});

export const selectMatchSchema = z.object({
  matchId: z.string().min(1),
  winnerCandidateId: z.string().min(1),
  loserCandidateId: z.string().min(1),
  elapsedMs: z.number().int().min(0).max(600000).default(0),
  clientSequence: z.number().int().min(1)
});
