/**
 * 미들웨어용 세션 갱신 + 인증 게이트 헬퍼.
 *
 * @supabase/ssr 공식 패턴: 요청/응답 쿠키 위에 서버 클라이언트를 만들고
 * getUser()를 호출해 만료 직전 토큰을 갱신한다. 갱신된 세션 쿠키는 반드시
 * 응답에 실어 보내야 하므로(그렇지 않으면 로그아웃됨), updateSession이 만든
 * 응답(또는 그 쿠키를 복사한 리다이렉트/401 응답)을 그대로 반환해야 한다.
 *
 * 인가 판단에는 항상 getUser()를 사용한다(getSession() 금지).
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

export interface UpdateSessionResult {
  /** 갱신된 세션 쿠키를 담은 응답. 호출부는 이 응답(혹은 쿠키 복사본)을 반환해야 한다. */
  response: NextResponse;
  /** 로그인한 사용자(없으면 null). */
  user: User | null;
}

export async function updateSession(
  request: NextRequest
): Promise<UpdateSessionResult> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 1) 요청 쿠키를 갱신(다운스트림 핸들러가 새 세션을 보게 한다).
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          // 2) 응답을 새로 만들어 갱신된 쿠키를 다시 실어 보낸다.
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        }
      }
    }
  );

  // getClaims()/getSession()이 아니라 getUser()로 토큰을 검증·갱신한다.
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return { response, user };
}
