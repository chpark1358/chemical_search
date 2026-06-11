import AccountMenu from "@/components/auth/AccountMenu";
import PaperSearchApp from "@/components/papers/PaperSearchApp";
import { createClient } from "@/lib/supabase/server";

// 로그인 세션(쿠키)에 따라 헤더가 달라지므로 정적 생성하지 않는다.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const email = user?.email ?? "";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 h-14 border-b border-hairline bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-full w-full max-w-[1200px] items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-5 items-center justify-center rounded-md bg-primary"
            >
              <span className="size-1.5 rounded-full bg-white" />
            </span>
            <span className="text-sm font-semibold tracking-[-0.02em] text-ink">
              Chemical Papers
            </span>
          </div>
          {email ? <AccountMenu email={email} /> : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6">
        <PaperSearchApp />
      </main>
    </div>
  );
}
