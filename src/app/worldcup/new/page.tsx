import { AppHeader } from "@/components/common/AppHeader";

export default function CreateWorldCupPage() {
  return (
    <main className="page-shell">
      <AppHeader />
      <section className="container py-8">
        <h1 className="text-3xl font-black">월드컵 만들기</h1>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {["기본 정보", "후보 등록", "미리보기/발행"].map((step, index) => (
            <section key={step} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5">
              <p className="text-sm font-bold text-[var(--accent)]">Step {index + 1}</p>
              <h2 className="mt-1 text-xl font-black">{step}</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                PRD 기준 검증과 업로드 흐름을 다음 구현 단계에서 연결합니다.
              </p>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
