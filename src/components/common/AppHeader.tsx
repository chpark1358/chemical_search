import Link from "next/link";
import { Search, ShieldCheck, Trophy } from "lucide-react";
import { routes } from "@/lib/routes";

export function AppHeader() {
  return (
    <header className="border-b border-[var(--line)] bg-[var(--surface)]">
      <div className="container flex min-h-16 items-center gap-4 py-3">
        <Link
          href={routes.home}
          className="focus-ring flex items-center gap-2 rounded-md text-base font-bold"
        >
          <Trophy size={22} aria-hidden="true" />
          월드컵 스튜디오
        </Link>
        <form action={routes.explore} className="hidden flex-1 md:block">
          <label className="flex h-11 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">월드컵 검색</span>
            <input
              name="q"
              placeholder="음식, 게임, 장소를 검색"
              className="w-full bg-transparent outline-none"
            />
          </label>
        </form>
        <Link
          href={routes.adminReports}
          className="focus-ring hidden items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-[var(--muted)] md:flex"
        >
          <ShieldCheck size={18} aria-hidden="true" />
          신고 관리
        </Link>
        <Link
          href={routes.createWorldCup}
          className="focus-ring rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white"
        >
          만들기
        </Link>
      </div>
    </header>
  );
}
