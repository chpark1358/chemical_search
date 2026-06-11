import { AlertTriangle, Check, Minus } from "lucide-react";

import type { Paper, Patent, ProviderResult, ProviderStatus } from "@/lib/api";

export const PROVIDER_LABELS: Record<string, string> = {
  semantic_scholar: "Semantic Scholar",
  crossref: "Crossref",
  openalex: "OpenAlex",
  surechembl: "SureChEMBL",
  kipris: "KIPRIS",
  pubchem: "PubChem 해석"
};

/** 논문 출처 프로바이더. */
const PAPER_SOURCES = new Set<string>(["semantic_scholar", "crossref", "openalex"]);

/** 특허 출처 프로바이더. 그 외(예: pubchem)는 화합물 해석 진단 항목이다. */
const PATENT_SOURCES = new Set<string>(["surechembl", "kipris"]);

const STATUS_LABELS: Record<ProviderStatus, string> = {
  ok: "정상",
  empty: "결과 없음",
  rate_limited: "요청 제한",
  timeout: "시간 초과",
  error: "오류"
};

export function providerLabel(name: string): string {
  return PROVIDER_LABELS[name] ?? name;
}

export function isProviderFailure(status: ProviderStatus): boolean {
  return status === "rate_limited" || status === "timeout" || status === "error";
}

/**
 * 상태별 칩 스타일. ok=success 틴트, empty=중립(muted), 실패(rate_limited/timeout/error)=danger 틴트.
 * 실패한 출처를 한눈에 스캔할 수 있게 색으로 구분한다. 토큰(--color-success/--color-danger)만 사용한다.
 */
function chipTone(status: ProviderStatus): string {
  if (status === "ok") {
    return "border-success/30 bg-success/5 text-ink-muted";
  }
  if (status === "empty") {
    return "border-hairline bg-surface-1 text-ink-subtle";
  }
  return "border-danger/40 bg-danger/10 text-ink-muted";
}

function StatusIcon({ status }: { status: ProviderStatus }) {
  if (status === "ok") {
    return <Check aria-hidden="true" className="size-3 text-success" />;
  }
  if (status === "empty") {
    return <Minus aria-hidden="true" className="size-3 text-ink-subtle" />;
  }
  return <AlertTriangle aria-hidden="true" className="size-3 text-danger" />;
}

function diagnostics(provider: ProviderResult): string {
  return [
    provider.cached ? "cache" : null,
    provider.latency_ms !== null ? `${provider.latency_ms}ms` : null,
    provider.retry_count > 0 ? `retry ${provider.retry_count}` : null
  ]
    .filter(Boolean)
    .join(" · ");
}

interface ProviderChipsProps {
  providers: ProviderResult[];
  papers: Paper[];
  patents: Patent[];
}

export default function ProviderChips({
  providers,
  papers,
  patents
}: ProviderChipsProps) {
  if (!providers.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {providers.map((provider) => {
        const isPaperSource = PAPER_SOURCES.has(provider.name);
        const isPatentSource = PATENT_SOURCES.has(provider.name);
        // 논문/특허 출처는 각자의 결과 건수를, 진단 항목(PubChem 해석)은 상태만 보여준다.
        const count = isPatentSource
          ? patents.filter((patent) => patent.source === provider.name).length
          : papers.filter((paper) => paper.source === provider.name).length;
        const detail = diagnostics(provider);
        const statusText =
          provider.status !== "ok"
            ? STATUS_LABELS[provider.status]
            : isPaperSource || isPatentSource
              ? `${count}건`
              : "완료";
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-3 text-xs ${chipTone(provider.status)}`}
            data-testid={`provider-chip-${provider.name}`}
            key={provider.name}
            title={provider.message ?? undefined}
          >
            <StatusIcon status={provider.status} />
            <span className="font-medium">{providerLabel(provider.name)}</span>
            <span className="text-ink-subtle">{statusText}</span>
            {detail ? (
              <span className="font-mono text-[11px] text-ink-tertiary">{detail}</span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
