import { fail, ok } from "@/lib/api/responses";
import { getPlaySession, getWorldcup, serializePlaySession } from "@/domains/worldcup/store";

type Context = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_request: Request, { params }: Context) {
  const { sessionId } = await params;
  const session = getPlaySession(sessionId);

  if (!session) {
    return fail("SESSION_NOT_FOUND", "플레이 세션을 찾을 수 없습니다.", 404);
  }

  const worldCup = getWorldcup(session.worldCupSlug);
  const winner = session.winnerCandidateId
    ? session.candidates.find((candidate) => candidate.id === session.winnerCandidateId)
    : null;

  return ok({
    session: serializePlaySession(session),
    worldCup,
    winner
  });
}
