/**
 * /chemical-api 프록시(Next.js rewrite → FastAPI)와 통신하는 타입 클라이언트.
 * 모든 필드는 백엔드 계약과 동일한 snake_case를 사용한다.
 */

export type SearchStatus =
  | "needs_candidate_selection"
  | "running"
  | "done"
  | "partial"
  | "failed";

export type InputType =
  | "auto"
  | "name"
  | "smiles"
  | "inchi"
  | "inchi_key"
  | "formula";

export type PaperSourceName = "semantic_scholar" | "crossref" | "openalex";

export type PatentSourceName = "surechembl";

/** 논문/특허 출처를 모두 포함하는 검색 소스 식별자. */
export type SourceName = PaperSourceName | PatentSourceName;

export type SortKey = "relevance" | "citations" | "year";

export type ProviderStatus =
  | "ok"
  | "empty"
  | "rate_limited"
  | "timeout"
  | "error";

export type ExportFormat = "csv" | "markdown" | "json";

export interface CompoundInfo {
  name: string | null;
  canonical_smiles: string | null;
  inchi_key: string | null;
  formula: string | null;
  cid: number | null;
  warnings: string[];
}

export interface Candidate {
  candidate_id: string;
  title: string;
  formula: string | null;
  smiles: string | null;
  cid: number | null;
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  venue: string | null;
  year: number | null;
  doi: string | null;
  url: string | null;
  citations: number | null;
  abstract: string | null;
  source: PaperSourceName;
  score: number;
}

export interface Patent {
  id: string;
  publication_number: string;
  title: string;
  url: string | null;
  assignee: string | null;
  date: string | null;
  source: PatentSourceName;
}

export interface ProviderResult {
  name: string;
  status: ProviderStatus;
  latency_ms: number | null;
  cached: boolean;
  retry_count: number;
  message: string | null;
}

export interface SearchRecord {
  search_id: string;
  status: SearchStatus;
  query: string;
  detected_type: string;
  compound: CompoundInfo | null;
  candidates: Candidate[];
  papers: Paper[];
  patents: Patent[];
  patents_total_hits: number | null;
  providers: ProviderResult[];
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CreateSearchInput {
  query: string;
  input_type?: InputType;
  sources?: SourceName[];
  limit?: number;
  sort?: SortKey;
}

const API_ROOT = "/chemical-api";

/** HTTP 상태 코드를 보존하는 API 오류. 호출부에서 404 등 상태별 분기에 사용한다. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function extractDetail(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        item && typeof item === "object" && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : null
      )
      .filter((message): message is string => Boolean(message));
    if (messages.length) return messages.join(" / ");
  }
  return null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers }
    });
  } catch {
    throw new Error("검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new ApiError(
      extractDetail(payload) ?? `요청이 실패했습니다. (HTTP ${response.status})`,
      response.status
    );
  }
  return (await response.json()) as T;
}

export function createSearch(input: CreateSearchInput): Promise<SearchRecord> {
  return request<SearchRecord>("/api/searches", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getSearch(searchId: string): Promise<SearchRecord> {
  return request<SearchRecord>(`/api/searches/${encodeURIComponent(searchId)}`);
}

export function selectSearchCandidate(
  searchId: string,
  candidateId: string
): Promise<SearchRecord> {
  return request<SearchRecord>(
    `/api/searches/${encodeURIComponent(searchId)}/select`,
    {
      method: "POST",
      body: JSON.stringify({ candidate_id: candidateId })
    }
  );
}

export function exportUrl(searchId: string, format: ExportFormat): string {
  return `${API_ROOT}/api/searches/${encodeURIComponent(searchId)}/export?format=${format}`;
}

/** http(s) URL만 허용한다 (javascript: 등 위험한 스킴 차단). */
export function isSafeUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
