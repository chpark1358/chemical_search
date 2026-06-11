/**
 * 전역 인증 게이트.
 *
 * 모든 요청에서 updateSession으로 세션을 갱신하고, 로그인하지 않은 사용자는
 * 공개 경로(/login, /auth/*, Next 내부 리소스)를 제외한 모든 곳에서 차단한다.
 *
 * - 앱 경로: /login으로 리다이렉트(원래 경로는 ?next=로 보존).
 * - /chemical-api/* (백엔드 프록시): HTML 리다이렉트 대신 401 JSON을 돌려준다
 *   (클라이언트 fetch가 깔끔하게 처리하도록). 이로써 백엔드 프록시도 로그인 세션을 요구한다.
 *
 * 어떤 경우든 updateSession이 만든 응답의 세션 쿠키를 보존해야 하므로,
 * 리다이렉트/401 응답에 갱신된 쿠키를 복사해 반환한다.
 */

import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/** 로그인 없이 접근 가능한 경로(정확히 일치하거나 접두사). */
function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/auth/")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const { pathname } = request.nextUrl;

  if (user || isPublicPath(pathname)) {
    return response;
  }

  // 백엔드 프록시는 fetch로 호출되므로 HTML 리다이렉트가 아닌 401 JSON을 돌려준다.
  if (pathname.startsWith("/chemical-api")) {
    const unauthorized = NextResponse.json(
      { detail: "로그인이 필요합니다. 다시 로그인해 주세요." },
      { status: 401 }
    );
    // 세션 갱신 쿠키를 보존한다.
    for (const cookie of response.cookies.getAll()) {
      unauthorized.cookies.set(cookie);
    }
    return unauthorized;
  }

  // 그 외 앱 경로: /login으로 리다이렉트(원래 경로 보존).
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/login";
  redirectUrl.search = "";
  const nextPath = pathname + request.nextUrl.search;
  if (nextPath && nextPath !== "/") {
    redirectUrl.searchParams.set("next", nextPath);
  }
  const redirect = NextResponse.redirect(redirectUrl);
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  matcher: [
    /*
     * 정적/내부 리소스를 제외한 모든 경로에서 동작한다:
     * - _next/static, _next/image (빌드/이미지 최적화 산출물)
     * - favicon.ico, 그리고 흔한 정적 확장자(이미지/폰트 등)
     * 그 외(앱 페이지 + /chemical-api 프록시)는 모두 게이트한다.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)"
  ]
};
