"use client";

import type { CompoundInfo } from "@/lib/api";

import CopyButton from "./CopyButton";

interface CopyFieldProps {
  label: string;
  value: string;
}

function CopyField({ label, value }: CopyFieldProps) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-xs text-ink-tertiary">{label}</span>
      <span className="truncate font-mono text-xs text-ink-muted">{value}</span>
      <CopyButton label={label} value={value} />
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
