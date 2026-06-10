"use client";

import {
  AlertTriangle,
  Atom,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  GitMerge,
  Info,
  LoaderCircle,
  Network,
  ShieldCheck,
  Search
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import {
  chemicalExportUrl,
  createChemicalSearch,
  getChemicalSearch,
  ProviderResult,
  SearchItem,
  SearchRecord,
  selectChemicalCandidate
} from "@/lib/chemical-api";

const SOURCE_OPTIONS = [
  { id: "pubchem", label: "PubChem", purpose: "구조·식별자" },
  { id: "chembl", label: "ChEMBL", purpose: "유사·부분 구조" },
  { id: "semantic_scholar", label: "Semantic Scholar", purpose: "논문" },
  { id: "crossref", label: "Crossref", purpose: "DOI 메타데이터" }
] as const;

type SourceId = (typeof SOURCE_OPTIONS)[number]["id"];

const STATUS_LABELS: Record<string, string> = {
  pending: "대기",
  needs_candidate_selection: "후보 선택 필요",
  running: "검색 중",
  done: "완료",
  partial_failed: "일부 결과",
  failed: "실패"
};

function scoreLabel(score: number | null) {
  return score === null ? "점수 없음" : `${Math.round(score * 100) / 100}`;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function evidenceList(item: SearchItem) {
  return Array.isArray(item.data.evidence)
    ? item.data.evidence.filter(
        (value): value is Record<string, unknown> => typeof value === "object" && value !== null
      )
    : [];
}

function googlePatentsUrl(compound: {
  names: string[];
  formula: string;
  inchi_key: string;
}) {
  const terms = [compound.names[0], compound.formula, compound.inchi_key].filter(Boolean);
  const query = terms.map((term) => `"${term}"`).join(" OR ");
  return `https://patents.google.com/?q=${encodeURIComponent(query)}`;
}

function StatusBadge({ status }: { status: string }) {
  const isRunning = status === "running" || status === "pending";
  const isWarning = status === "partial_failed" || status === "needs_candidate_selection";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
        isRunning
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : isWarning
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : status === "failed"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {isRunning ? <LoaderCircle className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function DataGuide() {
  const sources = [
    {
      name: "PubChem",
      bestFor: "화합물 식별·구조 확인",
      note: "NIH가 운영하는 대규모 집계 데이터베이스입니다. CID, 구조, 분자식, InChIKey 확인의 기본 출처로 사용합니다.",
      level: "기본 기준",
      href: "https://pubchem.ncbi.nlm.nih.gov/docs/"
    },
    {
      name: "ChEMBL",
      bestFor: "약물성·생물활성 데이터",
      note: "EMBL-EBI의 수동 큐레이션 데이터베이스입니다. 활성값과 약물 연구 맥락을 확인할 때 우선합니다.",
      level: "큐레이션",
      href: "https://www.ebi.ac.uk/chembl/"
    },
    {
      name: "Crossref",
      bestFor: "DOI·논문 서지정보 확인",
      note: "출판사와 신뢰 출처가 등록한 메타데이터입니다. 제목, DOI, 출판 정보 검증에 적합합니다.",
      level: "등록 정보",
      href: "https://www.crossref.org/documentation/retrieve-metadata/rest-api/"
    },
    {
      name: "Semantic Scholar",
      bestFor: "관련 논문 탐색",
      note: "논문, 저자, 인용 관계 탐색에 유용합니다. 현재 API rate limit으로 일부 결과가 빠질 수 있습니다.",
      level: "탐색 보조",
      href: "https://www.semanticscholar.org/product/api"
    },
    {
      name: "Google Patents",
      bestFor: "특허 원문 후보 탐색",
      note: "이름·분자식·InChIKey로 특허 후보를 찾는 외부 검색입니다. 최종 판단은 특허 원문과 관할 특허청에서 확인합니다.",
      level: "외부 탐색",
      href: "https://patents.google.com/"
    }
  ];
  const steps = [
    { label: "1. 입력 감지", detail: "이름, 분자식, SMILES, InChIKey 유형을 판별" },
    { label: "2. 구조 확정", detail: "후보 선택 후 RDKit으로 구조·식별자를 정규화" },
    { label: "3. 병렬 수집", detail: "선택한 공개 provider API에서 화합물·논문 자료 수집" },
    { label: "4. 병합·정리", detail: "InChIKey와 DOI 기준 중복 제거, 출처와 근거 보존" },
    { label: "5. 결과 표시", detail: "관련도 순 정렬, 장애 provider는 부분 결과로 표시" }
  ];

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[var(--brand)]">
            <ShieldCheck className="size-5" />
            <p className="text-xs font-black uppercase tracking-[0.18em]">Source reliability guide</p>
          </div>
          <h2 className="mt-2 text-xl font-black">어떤 출처를 기준으로 봐야 하나요?</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            하나의 사이트가 모든 항목에서 가장 정확하지는 않습니다. 구조 식별은 PubChem, 생물활성은 ChEMBL,
            논문 식별은 Crossref를 우선하고, Semantic Scholar와 Google Patents는 탐색 범위를 넓히는 용도로 사용합니다.
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 md:max-w-xs">
          <strong>주의:</strong> Rank score는 이 앱의 검색 관련도 점수입니다. 과학적 정확성, 특허 유효성 또는 법적 판단을
          의미하지 않습니다.
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {sources.map((source) => (
          <a
            className="focus-ring rounded-xl border border-[var(--line)] bg-white p-4 transition hover:border-[var(--brand)] hover:shadow-sm"
            href={source.href}
            key={source.name}
            rel="noreferrer"
            target="_blank"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-black">{source.name}</p>
              <span className="rounded-full bg-teal-50 px-2 py-1 text-[10px] font-bold text-[var(--brand)]">{source.level}</span>
            </div>
            <p className="mt-3 text-xs font-bold text-[var(--brand)]">{source.bestFor}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{source.note}</p>
          </a>
        ))}
      </div>

      <details className="mt-5 rounded-xl border border-[var(--line)] bg-[#f7f5ef] p-4" open>
        <summary className="cursor-pointer font-bold">
          <span className="ml-2 inline-flex items-center gap-2"><Network className="size-4 text-[var(--brand)]" />현재 자료를 불러오고 정리하는 방식</span>
        </summary>
        <div className="mt-4 grid gap-2 md:grid-cols-5">
          {steps.map((step, index) => (
            <div className="relative rounded-xl border border-[var(--line)] bg-white p-3" key={step.label}>
              <p className="text-xs font-black text-[var(--brand)]">{step.label}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{step.detail}</p>
              {index < steps.length - 1 ? <GitMerge className="absolute -right-3 top-1/2 hidden size-4 -translate-y-1/2 text-[var(--brand)] md:block" /> : null}
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[var(--muted)]">
          <Info className="mt-0.5 size-4 shrink-0 text-[var(--brand)]" />
          결과 카드의 출처, match reason, 근거 목록, provider 진단을 함께 확인하면 어떤 데이터가 어디에서 왔는지 추적할 수 있습니다.
        </p>
      </details>
    </section>
  );
}

function ProviderDiagnostics({ providers }: { providers: ProviderResult[] }) {
  if (!providers.length) return null;
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="mb-4 flex items-center gap-2">
        <Database className="size-5 text-[var(--brand)]" />
        <h2 className="text-lg font-bold">Provider 진단</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {providers.map((provider) => (
          <article className="rounded-xl border border-[var(--line)] bg-white p-4" key={`${provider.source}-${provider.operation}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">{provider.source}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{provider.operation}</p>
              </div>
              <StatusBadge status={provider.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-[var(--muted)]">응답</dt>
                <dd className="mt-1 font-bold">{provider.diagnostics.latency_ms}ms</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">결과</dt>
                <dd className="mt-1 font-bold">{provider.items.length}건</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Cache</dt>
                <dd className="mt-1 font-bold">{provider.diagnostics.cached ? "hit" : "miss"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Retry</dt>
                <dd className="mt-1 font-bold">{provider.diagnostics.retry_count}</dd>
              </div>
            </dl>
            {provider.diagnostics.message ? (
              <p className="mt-3 text-xs leading-5 text-amber-800">{provider.diagnostics.message}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ResultCard({ item, index }: { item: SearchItem; index: number }) {
  const evidence = evidenceList(item);
  const sources = stringList(item.data.sources);
  return (
    <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="flex gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 font-black text-[var(--brand)]">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
                <span>{item.kind}</span>
                <span>·</span>
                <span>{sources.length ? sources.join(" + ") : item.source}</span>
              </div>
              <h3 className="text-lg font-bold leading-snug">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.match_reason}</p>
            </div>
            <div className="rounded-xl bg-[#171717] px-3 py-2 text-right text-white">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Rank score</p>
              <p className="text-lg font-black">{scoreLabel(item.score)}</p>
            </div>
          </div>
          {evidence.length ? (
            <details className="mt-4 rounded-xl border border-[var(--line)] bg-white p-3">
              <summary className="cursor-pointer text-sm font-bold">근거 {evidence.length}개 보기</summary>
              <div className="mt-3 grid gap-2">
                {evidence.map((entry, entryIndex) => (
                  <div className="rounded-lg bg-[#f7f5ef] p-3 text-xs leading-5" key={entryIndex}>
                    <p className="font-bold">{String(entry.source ?? "unknown")} · {String(entry.operation ?? "search")}</p>
                    <p className="text-[var(--muted)]">{String(entry.match_reason ?? "")}</p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          <a
            className="focus-ring mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--brand)] hover:underline"
            href={item.source_url}
            rel="noreferrer"
            target="_blank"
          >
            원문 데이터 열기 <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}

export default function ChemicalSearchWorkspace() {
  const [query, setQuery] = useState("aspirin");
  const [inputType, setInputType] = useState<"auto" | "smiles" | "name" | "formula" | "inchi" | "inchi_key">("auto");
  const [mode, setMode] = useState<"all" | "exact" | "similarity" | "substructure">("all");
  const [threshold, setThreshold] = useState(80);
  const [sources, setSources] = useState<SourceId[]>(SOURCE_OPTIONS.map((source) => source.id));
  const [record, setRecord] = useState<SearchRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!record || !["pending", "running"].includes(record.status)) return;
    const timer = window.setInterval(async () => {
      try {
        setRecord(await getChemicalSearch(record.search_id));
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : "검색 상태를 확인하지 못했습니다.");
        window.clearInterval(timer);
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [record]);

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim() || !sources.length) return;
    setLoading(true);
    setError(null);
    setRecord(null);
    try {
      setRecord(
        await createChemicalSearch({
          query: query.trim(),
          input_type: inputType,
          mode,
          threshold,
          limit: 8,
          sources
        })
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "검색을 시작하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function chooseCandidate(candidateId: string) {
    if (!record) return;
    setLoading(true);
    setError(null);
    try {
      setRecord(await selectChemicalCandidate(record.search_id, candidateId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "후보를 선택하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function toggleSource(source: SourceId) {
    setSources((current) =>
      current.includes(source) ? current.filter((item) => item !== source) : [...current, source]
    );
  }

  const report = record?.report;
  const selected = report?.selected_compound;

  return (
    <main className="min-h-screen bg-[var(--background)] pb-20">
      <header className="border-b border-[var(--line)] bg-[#102c2a] text-white">
        <div className="container flex flex-col gap-6 py-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-teal-200">
              <Atom className="size-4" /> Research workspace
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">Chemical Search</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
              구조를 정규화하고 공개 화학·논문 데이터의 검색 근거를 한 화면에서 비교합니다.
            </p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs leading-5 text-white/70">
            PubChem · ChEMBL · Semantic Scholar · Crossref
          </div>
        </div>
      </header>

      <div className="container grid gap-6 pt-6">
        <DataGuide />
        <form className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm md:p-6" onSubmit={submitSearch}>
          <div className="mb-5 flex items-center gap-2">
            <FlaskConical className="size-5 text-[var(--brand)]" />
            <h2 className="text-lg font-bold">검색 조건</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_180px_180px]">
            <label className="grid gap-2 text-sm font-bold">
              화합물 입력
              <input
                className="focus-ring rounded-xl border border-[var(--line)] bg-white px-4 py-3 font-normal"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="예: aspirin, C9H8O4, CC(=O)OC1=CC=CC=C1C(=O)O"
                value={query}
              />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              입력 유형
              <select className="focus-ring rounded-xl border border-[var(--line)] bg-white px-3 py-3 font-normal" onChange={(event) => setInputType(event.target.value as typeof inputType)} value={inputType}>
                <option value="auto">자동 감지</option>
                <option value="name">Name</option>
                <option value="formula">Formula</option>
                <option value="smiles">SMILES</option>
                <option value="inchi">InChI</option>
                <option value="inchi_key">InChIKey</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold">
              검색 모드
              <select className="focus-ring rounded-xl border border-[var(--line)] bg-white px-3 py-3 font-normal" onChange={(event) => setMode(event.target.value as typeof mode)} value={mode}>
                <option value="all">전체</option>
                <option value="exact">정확 일치</option>
                <option value="similarity">유사 구조</option>
                <option value="substructure">부분 구조</option>
              </select>
            </label>
          </div>

          <div className="mt-5 grid gap-5 border-t border-[var(--line)] pt-5 lg:grid-cols-[220px_1fr_auto] lg:items-end">
            <label className="grid gap-2 text-sm font-bold">
              유사도 기준 <span className="text-[var(--brand)]">{threshold}%</span>
              <input className="accent-[var(--brand)]" max="100" min="0" onChange={(event) => setThreshold(Number(event.target.value))} type="range" value={threshold} />
            </label>
            <fieldset>
              <legend className="mb-2 text-sm font-bold">데이터 소스</legend>
              <div className="flex flex-wrap gap-2">
                {SOURCE_OPTIONS.map((source) => (
                  <label className="cursor-pointer rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs" key={source.id}>
                    <input checked={sources.includes(source.id)} className="mr-2 accent-[var(--brand)]" onChange={() => toggleSource(source.id)} type="checkbox" />
                    <strong>{source.label}</strong> <span className="text-[var(--muted)]">{source.purpose}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-6 font-bold text-white transition hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading || !query.trim() || !sources.length}
              type="submit"
            >
              {loading ? <LoaderCircle className="size-5 animate-spin" /> : <Search className="size-5" />}
              검색 실행
            </button>
          </div>
        </form>

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div><p className="font-bold">요청 오류</p><p className="mt-1">{error}</p></div>
          </div>
        ) : null}

        {record ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Search ID · {record.search_id}</p>
              <p className="mt-1 text-sm">입력 유형: <strong>{record.detected_type}</strong></p>
            </div>
            <StatusBadge status={record.status} />
          </section>
        ) : null}

        {record?.status === "needs_candidate_selection" ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="mb-4 flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 text-amber-700" />
              <div><h2 className="font-bold">검색할 화합물을 선택하세요</h2><p className="mt-1 text-sm text-amber-800">분자식 또는 이름이 여러 구조와 일치합니다.</p></div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {record.compound_candidates.map((candidate) => (
                <button className="focus-ring rounded-xl border border-amber-200 bg-white p-4 text-left transition hover:border-amber-500" disabled={loading} key={candidate.id} onClick={() => chooseCandidate(candidate.id)} type="button">
                  <p className="font-bold">{candidate.title}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{candidate.match_reason}</p>
                  <p className="mt-3 break-all font-mono text-xs">{String(candidate.data.canonical_smiles ?? candidate.id)}</p>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {record && ["pending", "running"].includes(record.status) ? (
          <div className="grid place-items-center rounded-2xl border border-[var(--line)] bg-[var(--surface)] py-16 text-center">
            <LoaderCircle className="size-8 animate-spin text-[var(--brand)]" />
            <p className="mt-4 font-bold">Provider 검색과 결과 병합을 진행하고 있습니다.</p>
            <p className="mt-2 text-sm text-[var(--muted)]">완료되면 이 화면이 자동으로 갱신됩니다.</p>
          </div>
        ) : null}

        {selected ? (
          <section className="rounded-2xl bg-[#102c2a] p-5 text-white md:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-200">Normalized compound</p>
                <h2 className="mt-3 text-2xl font-black">{selected.names[0] ?? selected.formula}</h2>
                <p className="mt-2 font-mono text-sm text-white/70">{selected.canonical_smiles}</p>
                <a
                  className="focus-ring mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#102c2a] transition hover:bg-teal-50"
                  href={googlePatentsUrl(selected)}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Search className="size-4" /> Google Patents에서 검색
                  <ExternalLink className="size-3.5" />
                </a>
                <p className="mt-2 max-w-xl text-xs leading-5 text-white/55">
                  화합물명, 분자식, InChIKey를 조합해 Google Patents 검색 결과를 엽니다.
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl border border-white/15 bg-white/5 p-4 text-sm md:grid-cols-3">
                <div><dt className="text-xs text-white/55">Formula</dt><dd className="mt-1 font-bold">{selected.formula}</dd></div>
                <div><dt className="text-xs text-white/55">Molecular weight</dt><dd className="mt-1 font-bold">{selected.molecular_weight}</dd></div>
                <div><dt className="text-xs text-white/55">InChIKey</dt><dd className="mt-1 break-all font-mono text-xs font-bold">{selected.inchi_key}</dd></div>
              </dl>
            </div>
          </section>
        ) : null}

        {report ? <ProviderDiagnostics providers={report.provider_results} /> : null}

        {report ? (
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--brand)]">Merged & ranked</p>
                <h2 className="mt-2 text-2xl font-black">검색 결과 {report.results.length}건</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["json", "markdown", "csv"] as const).map((format) => (
                  <a className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-bold uppercase hover:border-[var(--brand)]" href={chemicalExportUrl(record.search_id, format)} key={format}>
                    <Download className="size-3.5" /> {format}
                  </a>
                ))}
              </div>
            </div>
            {report.warnings.length ? (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-bold">부분 결과 안내</p>
                {report.warnings.map((warning) => <p className="mt-1" key={warning}>{warning}</p>)}
              </div>
            ) : null}
            <div className="grid gap-4">
              {report.results.map((item, index) => <ResultCard index={index} item={item} key={item.id} />)}
              {!report.results.length ? (
                <div className="grid place-items-center rounded-2xl border border-dashed border-[var(--line)] py-14 text-center text-[var(--muted)]">
                  <FileText className="size-7" />
                  <p className="mt-3 font-bold">표시할 병합 결과가 없습니다.</p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
