import { AppHeader } from "@/components/common/AppHeader";
import { WorldCupCard } from "@/components/worldcup/WorldCupCard";
import { worldCupCards } from "@/domains/worldcup/mock-data";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ExplorePage({ searchParams }: Props) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const results = query
    ? worldCupCards.filter((card) =>
        `${card.title} ${card.description} ${card.category}`.includes(query)
      )
    : worldCupCards;

  return (
    <main className="page-shell">
      <AppHeader />
      <section className="container py-8">
        <h1 className="text-3xl font-black">월드컵 탐색</h1>
        <p className="mt-2 text-[var(--muted)]">
          검색어, 카테고리, 정렬 필터가 붙을 목록 화면의 첫 골격입니다.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {results.map((worldCup) => (
            <WorldCupCard key={worldCup.slug} worldCup={worldCup} />
          ))}
        </div>
        {results.length === 0 ? (
          <div className="mt-8 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6">
            <p className="font-bold">검색 결과가 없습니다.</p>
            <p className="mt-2 text-sm text-[var(--muted)]">다른 단어로 다시 검색해보세요.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
