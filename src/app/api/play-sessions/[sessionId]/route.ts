import { fail, ok } from "@/lib/api/responses";
import { getPlaySession, serializePlaySession } from "@/domains/worldcup/store";

type Context = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_request: Request, { params }: Context) {
  const { sessionId } = await params;
  const session = getPlaySession(sessionId);

  if (!session) {
    return fail("SESSION_NOT_FOUND", "플레이 세션을 찾을 수 없습니다.", 404);
  }

  return ok(serializePlaySession(session));
}
