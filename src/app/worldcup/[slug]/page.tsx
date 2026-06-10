import Link from "next/link";
import { Flag, Play } from "lucide-react";
import { AppHeader } from "@/components/common/AppHeader";
import { findWorldCup } from "@/domains/worldcup/mock-data";
import { availableRounds, defaultRound, estimatedMinutes } from "@/domains/tournament/rounds";
import { routes } from "@/lib/routes";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function WorldCupDetailPage({ params }: Props) {
  const { slug } = await params;
  const worldCup = findWorldCup(slug);
  const rounds = availableRounds(worldCup.candidateCount);
  const selectedRound = defaultRound(worldCup.candidateCount);

  return (
    <main className="page-shell">
      <AppHeader />
      <section className="container grid gap-8 py-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-sm font-bold text-[var(--accent)]">{worldCup.category}</p>
          <h1 className="mt-2 text-3xl font-black md:text-5xl">{worldCup.title}</h1>
          <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">{worldCup.description}</p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold text-[var(--muted)]">
            <span>후보 {worldCup.candidateCount}명</span>
            <span>{worldCup.playCount.toLocaleString()}회 플레이</span>
            <span>완주율 {worldCup.completionRate}%</span>
          </div>
          <div className="mt-8 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
            <p className="text-sm font-bold">라운드 선택</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {rounds.map((round) => (
                <span
                  key={round}
                  className={`rounded-md border px-3 py-2 text-sm font-bold ${
                    round === selectedRound
                      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                      : "border-[var(--line)] bg-white"
                  }`}
                >
                  {round === 2 ? "결승" : `${round}강`}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm text-[var(--muted)]">
              기본 {selectedRound}강, 예상 {estimatedMinutes(selectedRound)}분
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={routes.worldCupPlay(worldCup.slug)}
              className="focus-ring flex h-12 items-center justify-center gap-2 rounded-md bg-[var(--brand)] px-5 font-bold text-white"
            >
              <Play size={19} aria-hidden="true" />
              시작하기
            </Link>
            <button className="focus-ring flex h-12 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white px-5 font-bold">
              <Flag size={19} aria-hidden="true" />
              신고
            </button>
          </div>
        </div>
        <aside className="space-y-5">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-black">후보 미리보기</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {worldCup.candidates.slice(0, 6).map((candidate) => (
                <div key={candidate.id} className="overflow-hidden rounded-md border border-[var(--line)] bg-white">
                  <div className="h-20" style={{ background: candidate.color }} />
                  <p className="p-3 text-sm font-bold">{candidate.name}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-black">랭킹 Top 3</h2>
            <ol className="mt-4 space-y-3">
              {worldCup.rankings.map((ranking, index) => (
                <li key={ranking.candidateId} className="flex justify-between text-sm">
                  <span className="font-bold">
                    {index + 1}. {ranking.name}
                  </span>
                  <span className="text-[var(--muted)]">승률 {ranking.winRate}%</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </section>
    </main>
  );
}
