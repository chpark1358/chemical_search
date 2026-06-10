import Link from "next/link";
import { Copy, Download, RotateCcw } from "lucide-react";
import { AppHeader } from "@/components/common/AppHeader";
import { findWorldCup } from "@/domains/worldcup/mock-data";
import { routes } from "@/lib/routes";

type Props = {
  params: Promise<{ slug: string; sessionId: string }>;
};

export default async function ResultPage({ params }: Props) {
  const { slug, sessionId } = await params;
  const worldCup = findWorldCup(slug);
  const winner = worldCup.candidates[1];

  return (
    <main className="page-shell">
      <AppHeader />
      <section className="container py-8">
        <p className="text-sm font-bold text-[var(--accent)]">결과 #{sessionId}</p>
        <div className="mt-3 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]">
            <div className="aspect-square" style={{ background: winner.color }} />
            <div className="p-5">
              <p className="text-sm font-bold text-[var(--muted)]">나의 우승자</p>
              <h1 className="mt-1 text-3xl font-black">{winner.name}</h1>
              <p className="mt-2 text-[var(--muted)]">{winner.description}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5">
              <h2 className="text-xl font-black">공유</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button className="focus-ring flex h-12 items-center justify-center gap-2 rounded-md bg-[var(--brand)] font-bold text-white">
                  <Copy size={18} aria-hidden="true" />
                  링크 복사
                </button>
                <button className="focus-ring flex h-12 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white font-bold">
                  <Download size={18} aria-hidden="true" />
                  이미지 저장
                </button>
              </div>
            </div>
            <Link
              href={routes.worldCupPlay(worldCup.slug)}
              className="focus-ring flex h-12 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white font-bold"
            >
              <RotateCcw size={18} aria-hidden="true" />
              다시하기
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
