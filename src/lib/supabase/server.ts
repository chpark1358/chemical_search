/**
 * 서버 컴포넌트/라우트 핸들러용 Supabase 클라이언트.
 *
 * Next.js의 cookies()는 비동기이므로 await 후 getAll/setAll를 연결한다.
 * 서버 컴포넌트에서는 쿠키를 쓸 수 없어 setAll이 throw할 수 있으므로 try/catch로 감싼다.
 * (미들웨어가 세션을 갱신해 주므로, 서버 컴포넌트에서의 setAll 실패는 무시해도 안전하다.)
 *
 * 인가(권한) 판단에는 항상 supabase.auth.getUser()/getClaims()를 사용한다.
 * getSession()은 쿠키를 신뢰하므로 서버 측 인가에 사용하지 않는다.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // 서버 컴포넌트에서 호출되면 set이 throw한다. 미들웨어가 세션을
            // 갱신하므로 여기서의 실패는 무시해도 안전하다.
          }
        }
      }
    }
  );
}
