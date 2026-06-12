/**
 * 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트.
 *
 * @supabase/ssr의 createBrowserClient는 세션을 쿠키에 보관하므로,
 * 같은 세션 쿠키가 서버 컴포넌트/미들웨어와 자동으로 공유된다.
 * 인증 토큰은 NEXT_PUBLIC_* 환경변수에서 읽는다(하드코딩 금지).
 */

import { createBrowserClient } from "@supabase/ssr";

type BrowserClient = ReturnType<typeof createBrowserClient>;

// 브라우저 클라이언트는 모듈 레벨 싱글톤으로 1회만 생성해 재사용한다.
// (매 변이마다 새 createBrowserClient를 만들면 onAuthStateChange 리스너가 중복되고
//  세션 상태 동기화가 어긋날 수 있다. 같은 세션 쿠키를 공유하는 단일 인스턴스가 안전하다.)
let browserClient: BrowserClient | null = null;

export function createClient(): BrowserClient {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return browserClient;
}
