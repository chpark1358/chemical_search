import { z } from "zod";

export const worldCupListQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  sort: z.enum(["popular", "latest", "completionRate"]).optional(),
  period: z.enum(["all", "today", "week", "month"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional()
});

export const createWorldCupSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
  category: z.string().trim().min(1).max(30),
  editPassword: z.string().min(8).max(72),
  isSensitive: z.boolean().default(false)
});

export const candidateDraftSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(240).default(""),
  mediaUrl: z.string().url().optional()
});
