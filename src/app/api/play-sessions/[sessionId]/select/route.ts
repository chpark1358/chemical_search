import { fail, ok, validationFail } from "@/lib/api/responses";
import { selectMatch, serializePlaySession } from "@/domains/worldcup/store";
import { selectMatchSchema } from "@/domains/play-session/schemas";

type Context = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  const { sessionId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = selectMatchSchema.safeParse(body);

  if (!parsed.success) {
    return validationFail(parsed.error);
  }

  const result = selectMatch({
    sessionId,
    ...parsed.data
  });

  if (result.error === "session_not_found") {
    return fail("SESSION_NOT_FOUND", "플레이 세션을 찾을 수 없습니다.", 404);
  }

  if (result.error === "session_completed") {
    return fail("SESSION_COMPLETED", "이미 완료된 세션입니다.", 409, serializePlaySession(result.session));
  }

  if (result.error === "match_out_of_sync") {
    return fail("MATCH_OUT_OF_SYNC", "현재 매치 상태가 맞지 않습니다.", 409, serializePlaySession(result.session));
  }

  if (result.error === "match_already_resolved") {
    return fail(
      "MATCH_ALREADY_RESOLVED",
      "이미 처리된 매치입니다.",
      409,
      serializePlaySession(result.session)
    );
  }

  return ok({
    session: serializePlaySession(result.session),
    idempotent: Boolean(result.idempotent)
  });
}
