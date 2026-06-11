"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { CompoundInfo } from "@/lib/api";

/** http LAN 등 navigator.clipboard가 없는 환경을 위한 execCommand 폴백. */
function legacyCopy(value: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

type CopyResult = "idle" | "copied" | "failed";

interface CopyFieldProps {
  label: string;
  value: string;
}

function CopyField({ label, value }: CopyFieldProps) {
  const [copyResult, setCopyResult] = useState<CopyResult>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  async function copy() {
    let ok = false;
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(value);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok) ok = legacyCopy(value);
    setCopyResult(ok ? "copied" : "failed");
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopyResult("idle"), 1500);
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-xs text-ink-tertiary">{label}</span>
      <span className="truncate font-mono text-xs text-ink-muted">{value}</span>
      <button
        aria-label={copyResult === "failed" ? `${label} 복사 실패` : `${label} 복사`}
        className="shrink-0 rounded p-1 text-ink-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
        onClick={() => void copy()}
        title={copyResult === "failed" ? "복사 실패" : undefined}
        type="button"
      >
        {copyResult === "copied" ? (
          <Check aria-hidden="true" className="size-3 text-success" />
        ) : copyResult === "failed" ? (
          <X aria-hidden="true" className="size-3 text-danger" />
        ) : (
          <Copy aria-hidden="true" className="size-3" />
        )}
      </button>
    </span>
  );
}

export default function CompoundCard({ compound }: { compound: CompoundInfo }) {
  const fields = [
    compound.formula ? { label: "분자식", value: compound.formula } : null,
    compound.inchi_key ? { label: "InChIKey", value: compound.inchi_key } : null,
    compound.cid !== null ? { label: "CID", value: String(compound.cid) } : null,
    compound.canonical_smiles
      ? { label: "SMILES", value: compound.canonical_smiles }
      : null
  ].filter((field): field is { label: string; value: string } => field !== null);

  return (
    <section className="panel-highlight rounded-xl border border-hairline bg-surface-1 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.03em] text-ink-subtle">
        확인된 화합물
      </p>
      <h2 className="mt-1 text-base font-semibold tracking-[-0.02em] text-ink">
        {compound.name ?? compound.formula ?? "이름 미상"}
      </h2>
      {fields.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {fields.map((field) => (
            <CopyField key={field.label} label={field.label} value={field.value} />
          ))}
        </div>
      ) : null}
      {compound.warnings.length ? (
        <div className="mt-2">
          {compound.warnings.map((warning) => (
            <p className="text-xs leading-5 text-ink-tertiary" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
