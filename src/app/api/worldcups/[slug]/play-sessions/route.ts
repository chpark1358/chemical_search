import { fail, ok, validationFail } from "@/lib/api/responses";
import { createPlaySession, serializePlaySession } from "@/domains/worldcup/store";
import { createPlaySessionSchema } from "@/domains/play-session/schemas";

type Context = {
  params: Promise<{ slug: string }>;
};

export async function POST(request: Request, { params }: Context) {
  const { slug } = await params;
  const body = await request.json().catch(() => null);
  const parsed = createPlaySessionSchema.safeParse(body);

  if (!parsed.success) {
    return validationFail(parsed.error);
  }

  const result = createPlaySession({
    slug,
    ...parsed.data
  });

  if (result.error === "not_found") {
    return fail("WORLDCUP_NOT_FOUND", "월드컵을 찾을 수 없습니다.", 404);
  }

  if (result.error === "round_not_allowed") {
    return fail("ROUND_NOT_ALLOWED", "선택할 수 없는 라운드입니다.", 422);
  }

  return ok(serializePlaySession(result.session), { status: 201 });
}
