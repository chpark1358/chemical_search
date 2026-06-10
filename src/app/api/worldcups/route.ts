import { NextRequest } from "next/server";
import { ok, validationFail } from "@/lib/api/responses";
import { listWorldcups } from "@/domains/worldcup/store";
import { worldCupListQuerySchema } from "@/domains/worldcup/schemas";

export function GET(request: NextRequest) {
  const parsed = worldCupListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );

  if (!parsed.success) {
    return validationFail(parsed.error);
  }

  return ok({
    items: listWorldcups(parsed.data),
    nextCursor: null
  });
}
