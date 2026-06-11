/**
 * 스모크 테스트 인증 헬퍼.
 *
 * 게이트를 통과시키기 위해 @supabase/ssr가 기대하는 세션 쿠키를 직접 심는다.
 * 쿠키 이름은 supabase-js의 기본 규칙 `sb-<hostname 첫 라벨>-auth-token`을 따른다.
 * 테스트에서는 NEXT_PUBLIC_SUPABASE_URL이 http://localhost:54321(목)이므로
 * 첫 라벨은 "localhost" → 쿠키 이름은 sb-localhost-auth-token.
 *
 * 쿠키 값 인코딩은 @supabase/ssr 기본값(base64url)과 동일하게
 * "base64-" + base64url(JSON.stringify(session)) 형식이다.
 */

import type { BrowserContext } from "@playwright/test";

const COOKIE_NAME = "sb-localhost-auth-token";

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

const SESSION = {
  access_token: "fake-access-token",
  refresh_token: "fake-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: FAR_FUTURE,
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "smoke@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z"
  }
};

/** base64url(no-pad) 인코딩. 세션 JSON은 ASCII이므로 ssr의 stringToBase64URL과 동일. */
function toBase64Url(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

/** 로그인된 것처럼 보이도록 세션 쿠키를 컨텍스트에 심는다. */
export async function setFakeAuthCookie(context: BrowserContext): Promise<void> {
  const value = `base64-${toBase64Url(JSON.stringify(SESSION))}`;
  await context.addCookies([
    {
      name: COOKIE_NAME,
      value,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
      expires: FAR_FUTURE
    }
  ]);
}
