import { AppHeader } from "@/components/common/AppHeader";
import { WorldCupCard } from "@/components/worldcup/WorldCupCard";
import { worldCupCards } from "@/domains/worldcup/mock-data";

export default function HomePage() {
  return (
    <main className="page-shell">
      <AppHeader />
      <section className="container py-8 md:py-10">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-normal md:text-4xl">
              지금 바로 고를 수 있는 월드컵
            </h1>
            <p className="mt-2 max-w-2xl text-[var(--muted)]">
              상세를 확인하고 라운드를 선택한 뒤 1:1 토너먼트를 시작합니다.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {worldCupCards.map((worldCup) => (
            <WorldCupCard key={worldCup.slug} worldCup={worldCup} />
          ))}
        </div>
      </section>
    </main>
  );
}
