"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

interface AccountMenuProps {
  email: string;
}

/**
 * 헤더의 계정 표시 + 로그아웃. 로그아웃 시 브라우저 클라이언트로 signOut 후
 * /login으로 보낸다(서버 컴포넌트가 새 세션을 읽도록 refresh도 호출).
 */
export default function AccountMenu({ email }: AccountMenuProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    if (pending) return;
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2.5" data-testid="account-menu">
      <span
        className="hidden max-w-[180px] truncate text-xs text-ink-subtle sm:inline"
        data-testid="account-email"
        title={email}
      >
        {email}
      </span>
      <button
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline bg-surface-1 px-2.5 text-xs text-ink-subtle transition-colors duration-150 hover:border-hairline-strong hover:text-ink-muted disabled:opacity-60"
        data-testid="sign-out"
        disabled={pending}
        onClick={handleSignOut}
        type="button"
      >
        <LogOut aria-hidden="true" className="size-3.5" />
        {pending ? "로그아웃 중…" : "로그아웃"}
      </button>
    </div>
  );
}
