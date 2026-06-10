import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "WORLDCUP_NOT_FOUND"
  | "WORLDCUP_NOT_PLAYABLE"
  | "ROUND_NOT_ALLOWED"
  | "SESSION_NOT_FOUND"
  | "SESSION_COMPLETED"
  | "MATCH_ALREADY_RESOLVED"
  | "MATCH_OUT_OF_SYNC";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(code: ApiErrorCode, message: string, status = 400, detail?: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        detail
      }
    },
    { status }
  );
}

export function validationFail(error: ZodError) {
  return fail("VALIDATION_ERROR", "요청 형식이 올바르지 않습니다.", 422, error.flatten());
}
