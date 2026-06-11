"use client";

import { Search } from "lucide-react";
import type { FormEvent, RefObject } from "react";

const EXAMPLES = ["아스피린", "aspirin", "CC(=O)Oc1ccccc1C(=O)O", "C9H8O4"] as const;

interface SearchBarProps {
  variant: "hero" | "compact";
  value: string;
  busy: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

export default function SearchBar({
  variant,
  value,
  busy,
  inputRef,
  onChange,
  onSubmit
}: SearchBarProps) {
  const isHero = variant === "hero";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim() || busy) return;
    onSubmit(value);
  }

  return (
    <div className={isHero ? "w-full max-w-[640px]" : "w-full"}>
      <form className="flex items-center gap-2" onSubmit={handleSubmit} role="search">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
          />
          <input
            aria-label="화학물질 검색"
            autoComplete="off"
            className={`w-full rounded-lg border border-hairline bg-surface-1 pl-9 pr-3 text-ink transition-colors duration-150 placeholder:text-ink-tertiary hover:border-hairline-strong focus:border-hairline-strong focus:outline-2 focus:outline-primary/50 ${
              isHero ? "h-12 text-base" : "h-9 text-sm"
            }`}
            onChange={(event) => onChange(event.target.value)}
            placeholder="물질명(한글/영문), SMILES, InChIKey, 분자식…"
            ref={inputRef}
            spellCheck={false}
            type="text"
            value={value}
          />
        </div>
        <button
          className={`shrink-0 rounded-lg bg-primary font-medium text-white transition-colors duration-150 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 ${
            isHero ? "h-12 px-5 text-base" : "h-9 px-3.5 text-sm"
          }`}
          disabled={busy || !value.trim()}
          type="submit"
        >
          검색
        </button>
      </form>
      {isHero ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-ink-tertiary">예시</span>
          {EXAMPLES.map((example) => (
            <button
              className="rounded-md border border-hairline bg-surface-1 px-2.5 py-1 font-mono text-xs text-ink-subtle transition-colors duration-150 hover:border-hairline-strong hover:bg-surface-2 hover:text-ink-muted"
              key={example}
              onClick={() => {
                onChange(example);
                inputRef.current?.focus();
              }}
              type="button"
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
