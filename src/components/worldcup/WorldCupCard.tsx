import Link from "next/link";
import { Play } from "lucide-react";
import type { WorldCupCard as WorldCupCardType } from "@/domains/worldcup/types";
import { routes } from "@/lib/routes";

type Props = {
  worldCup: WorldCupCardType;
};

export function WorldCupCard({ worldCup }: Props) {
  return (
    <article className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] shadow-sm">
      <Link href={routes.worldCupDetail(worldCup.slug)} className="focus-ring block">
        <div className="grid aspect-[16/9] grid-cols-2">
          <div style={{ background: worldCup.coverColors[0] }} />
          <div style={{ background: worldCup.coverColors[1] }} />
        </div>
        <div className="space-y-3 p-4">
          <div>
            <p className="text-xs font-bold text-[var(--accent)]">{worldCup.category}</p>
            <h2 className="mt-1 line-clamp-2 text-lg font-bold">{worldCup.title}</h2>
          </div>
          <p className="line-clamp-2 min-h-10 text-sm text-[var(--muted)]">
            {worldCup.description}
          </p>
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-[var(--muted)]">
            <span>후보 {worldCup.candidateCount}명</span>
            <span>{worldCup.playCount.toLocaleString()}회 플레이</span>
            <span>완주율 {worldCup.completionRate}%</span>
          </div>
        </div>
      </Link>
      <div className="border-t border-[var(--line)] p-3">
        <Link
          href={routes.worldCupPlay(worldCup.slug)}
          className="focus-ring flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] text-sm font-bold text-white"
        >
          <Play size={18} aria-hidden="true" />
          바로 시작
        </Link>
      </div>
    </article>
  );
}
