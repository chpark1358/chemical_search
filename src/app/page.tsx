import PaperSearchApp from "@/components/papers/PaperSearchApp";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 h-14 border-b border-hairline bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-full w-full max-w-[1200px] items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-5 items-center justify-center rounded-md bg-primary"
            >
              <span className="size-1.5 rounded-full bg-white" />
            </span>
            <span className="text-sm font-semibold tracking-[-0.02em] text-ink">
              Chemical Papers
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-tertiary">
            <span className="hidden sm:inline">빠른 검색</span>
            <kbd className="rounded-md border border-hairline bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] text-ink-subtle">
              /
            </kbd>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6">
        <PaperSearchApp />
      </main>
    </div>
  );
}
