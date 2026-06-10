import { fail, ok } from "@/lib/api/responses";
import { getWorldcup } from "@/domains/worldcup/store";

type Context = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: Context) {
  const { slug } = await params;
  const worldCup = getWorldcup(slug);

  if (!worldCup) {
    return fail("WORLDCUP_NOT_FOUND", "월드컵을 찾을 수 없습니다.", 404);
  }

  return ok({
    items: worldCup.candidates
  });
}
