/**
 * 이메일 확인(OTP) 콜백.
 *
 * 회원가입 확인 메일의 링크는 ?token_hash=...&type=... 로 이 경로에 들어온다.
 * verifyOtp로 세션을 수립한 뒤 홈(또는 ?next=)으로 리다이렉트한다.
 * (이메일 확인이 꺼져 있어도 이 경로가 호출될 일은 없지만, 켜져 있으면 정상 동작한다.)
 */

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/** 안전한 내부 경로만 허용한다(오픈 리다이렉트 방지). */
function safeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

/** verifyOtp에 넘길 수 있는 OTP 타입 허용 목록. 그 외 값은 거부한다. */
const ALLOWED_OTP_TYPES: ReadonlySet<EmailOtpType> = new Set<EmailOtpType>([
  "email",
  "signup",
  "recovery",
  "email_change",
  "magiclink"
]);

function parseOtpType(value: string | null): EmailOtpType | null {
  return value && ALLOWED_OTP_TYPES.has(value as EmailOtpType)
    ? (value as EmailOtpType)
    : null;
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = parseOtpType(searchParams.get("type"));
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash
    });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // 토큰이 없거나 검증 실패: 로그인 페이지로 보낸다.
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "confirm");
  return NextResponse.redirect(loginUrl);
}
