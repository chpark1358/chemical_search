import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import AuthForm from "./AuthForm";

// 세션(쿠키)에 따라 결과가 달라지므로 정적 생성하지 않는다.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // 이미 로그인한 사용자가 /login에 오면 홈으로 보낸다.
  if (user) redirect("/");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <AuthForm />
    </main>
  );
}
