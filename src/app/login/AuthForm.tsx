"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";

/** Supabase 오류 메시지를 한국어 안내로 변환한다(대표적인 경우만, 그 외는 원문 노출). */
function localizeAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (lower.includes("password should be at least")) {
    return "비밀번호가 너무 짧습니다. 6자 이상으로 입력해 주세요.";
  }
  if (lower.includes("user already registered")) {
    return "이미 가입된 이메일입니다. 로그인해 주세요.";
  }
  if (lower.includes("unable to validate email") || lower.includes("invalid email")) {
    return "이메일 형식이 올바르지 않습니다.";
  }
  if (lower.includes("email not confirmed")) {
    return "이메일 인증이 완료되지 않았습니다. 메일의 링크를 클릭해 주세요.";
  }
  return message;
}

/** "다음 경로"가 안전한 내부 경로일 때만 사용한다(오픈 리다이렉트 방지). */
function safeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

function AuthFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(action: Mode) {
    if (pending) return;
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("이메일과 비밀번호를 모두 입력해 주세요.");
      return;
    }

    setPending(true);
    const supabase = createClient();

    try {
      if (action === "sign-in") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password
        });
        if (signInError) {
          setError(localizeAuthError(signInError.message));
          return;
        }
        router.replace(next);
        router.refresh();
        return;
      }

      // 회원가입
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password
      });
      if (signUpError) {
        setError(localizeAuthError(signUpError.message));
        return;
      }
      // 이메일 확인이 켜져 있으면 세션 없이 user만 반환된다.
      if (data.session) {
        router.replace(next);
        router.refresh();
        return;
      }
      setNotice("확인 이메일을 보냈습니다. 메일의 링크를 클릭해 주세요.");
    } catch {
      setError("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="flex w-full max-w-[400px] flex-col gap-5 rounded-xl border border-hairline bg-surface-1 p-7"
      data-testid="auth-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(mode);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold tracking-[-0.02em] text-ink">
          Chemical Papers
        </h1>
        <p className="text-sm text-ink-subtle">
          {mode === "sign-in"
            ? "이메일로 로그인하세요."
            : "이메일과 비밀번호로 계정을 만드세요."}
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-ink-tertiary">이메일</span>
        <input
          autoComplete="email"
          className="h-10 w-full rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink transition-colors duration-150 placeholder:text-ink-tertiary hover:border-hairline-strong focus:border-hairline-strong focus:outline-2 focus:outline-primary/50"
          data-testid="auth-email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-ink-tertiary">비밀번호</span>
        <input
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          className="h-10 w-full rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink transition-colors duration-150 placeholder:text-ink-tertiary hover:border-hairline-strong focus:border-hairline-strong focus:outline-2 focus:outline-primary/50"
          data-testid="auth-password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          required
          type="password"
          value={password}
        />
      </label>

      {error ? (
        <p
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
          data-testid="auth-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-ink-subtle"
          data-testid="auth-notice"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {mode === "sign-in" ? (
          <>
            <button
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-primary-hover disabled:opacity-60"
              data-testid="auth-submit-sign-in"
              disabled={pending}
              type="submit"
            >
              {pending ? "로그인 중…" : "로그인"}
            </button>
            <button
              className="inline-flex h-10 items-center justify-center rounded-lg border border-hairline bg-surface-2 px-4 text-sm text-ink-subtle transition-colors duration-150 hover:border-hairline-strong hover:text-ink"
              data-testid="auth-switch-sign-up"
              disabled={pending}
              onClick={() => {
                setMode("sign-up");
                setError(null);
                setNotice(null);
              }}
              type="button"
            >
              회원가입
            </button>
          </>
        ) : (
          <>
            <button
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-primary-hover disabled:opacity-60"
              data-testid="auth-submit-sign-up"
              disabled={pending}
              type="submit"
            >
              {pending ? "가입 중…" : "회원가입"}
            </button>
            <button
              className="inline-flex h-10 items-center justify-center rounded-lg border border-hairline bg-surface-2 px-4 text-sm text-ink-subtle transition-colors duration-150 hover:border-hairline-strong hover:text-ink"
              data-testid="auth-switch-sign-in"
              disabled={pending}
              onClick={() => {
                setMode("sign-in");
                setError(null);
                setNotice(null);
              }}
              type="button"
            >
              로그인으로
            </button>
          </>
        )}
      </div>
    </form>
  );
}

/** useSearchParams는 Suspense 경계가 필요하다(빌드 시 CSR bailout 방지). */
export default function AuthForm() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-[400px] rounded-xl border border-hairline bg-surface-1 p-7" />
      }
    >
      <AuthFormInner />
    </Suspense>
  );
}
