/**
 * 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트.
 *
 * @supabase/ssr의 createBrowserClient는 세션을 쿠키에 보관하므로,
 * 같은 세션 쿠키가 서버 컴포넌트/미들웨어와 자동으로 공유된다.
 * 인증 토큰은 NEXT_PUBLIC_* 환경변수에서 읽는다(하드코딩 금지).
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
