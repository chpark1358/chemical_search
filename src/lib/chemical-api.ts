export type SearchStatus =
  | "pending"
  | "needs_candidate_selection"
  | "running"
  | "done"
  | "partial_failed"
  | "failed";

export type SearchItem = {
  id: string;
  source: string;
  kind: string;
  title: string;
  source_url: string;
  match_reason: string;
  score: number | null;
  data: Record<string, unknown>;
};

export type ProviderResult = {
  source: string;
  operation: string;
  status: string;
  items: SearchItem[];
  diagnostics: {
    latency_ms: number;
    retrieved_at: string;
    cached: boolean;
    retry_count: number;
    message: string | null;
  };
};

export type SearchReport = {
  query: string;
  detected_type: string;
  mode: string;
  threshold: number;
  status: string;
  selected_compound: {
    original_input: string;
    detected_type: string;
    canonical_smiles: string;
    inchi_key: string;
    formula: string;
    molecular_weight: number;
    names: string[];
    warnings: string[];
  } | null;
  compound_candidates: SearchItem[];
  provider_results: ProviderResult[];
  results: SearchItem[];
  warnings: string[];
};

export type SearchRecord = {
  search_id: string;
  status: SearchStatus;
  detected_type: string;
  selected_candidate_id: string | null;
  compound_candidates: SearchItem[];
  report: SearchReport | null;
  error: string | null;
  poll_url: string;
};

export type CreateSearchInput = {
  query: string;
  input_type: "auto" | "smiles" | "name" | "formula" | "inchi" | "inchi_key";
  mode: "all" | "exact" | "similarity" | "substructure";
  threshold: number;
  limit: number;
  sources: Array<"pubchem" | "chembl" | "semantic_scholar" | "crossref">;
};

const API_ROOT = "/chemical-api";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Chemical API request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export function createChemicalSearch(input: CreateSearchInput) {
  return apiRequest<SearchRecord>("/api/searches", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function selectChemicalCandidate(searchId: string, candidateId: string) {
  return apiRequest<SearchRecord>(`/api/searches/${searchId}/select-compound`, {
    method: "POST",
    body: JSON.stringify({ candidate_id: candidateId })
  });
}

export function getChemicalSearch(searchId: string) {
  return apiRequest<SearchRecord>(`/api/searches/${searchId}`);
}

export function chemicalExportUrl(searchId: string, format: "json" | "markdown" | "csv") {
  return `${API_ROOT}/api/searches/${searchId}/export?format=${format}`;
}
