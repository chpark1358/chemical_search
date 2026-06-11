import { expect, test, type Page, type Route } from "@playwright/test";

type Json = Record<string, unknown>;

const COMPOUND: Json = {
  name: "aspirin",
  canonical_smiles: "CC(=O)Oc1ccccc1C(=O)O",
  inchi_key: "BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
  formula: "C9H8O4",
  cid: 2244,
  warnings: []
};

// 백엔드는 화합물 해석 진단 항목(pubchem)을 providers 맨 앞에 항상 추가한다.
const PUBCHEM_PROVIDER: Json = {
  name: "pubchem",
  status: "ok",
  latency_ms: 180,
  cached: false,
  retry_count: 0,
  message: null
};

const PROVIDERS_OK: Json[] = [
  PUBCHEM_PROVIDER,
  {
    name: "semantic_scholar",
    status: "ok",
    latency_ms: 320,
    cached: false,
    retry_count: 0,
    message: null
  },
  {
    name: "crossref",
    status: "ok",
    latency_ms: 410,
    cached: true,
    retry_count: 0,
    message: null
  }
];

const PAPERS: Json[] = [
  {
    id: "p1",
    title: "Aspirin and cardiovascular outcomes",
    authors: ["A. Kim", "B. Lee"],
    venue: "The Lancet",
    year: 2018,
    doi: "10.1000/aspirin.1",
    url: "https://example.com/p1",
    citations: 920,
    abstract: "Background: aspirin reduces cardiovascular events.",
    source: "semantic_scholar",
    score: 0.95
  },
  {
    id: "p2",
    title: "Salicylate chemistry revisited",
    authors: ["C. Park"],
    venue: "JACS",
    year: 2024,
    doi: "10.1000/aspirin.2",
    url: "https://example.com/p2",
    citations: 12,
    abstract: null,
    source: "crossref",
    score: 0.41
  }
];

const CANDIDATES: Json[] = [
  {
    candidate_id: "c1",
    title: "Aspirin",
    formula: "C9H8O4",
    smiles: "CC(=O)Oc1ccccc1C(=O)O",
    cid: 2244
  },
  {
    candidate_id: "c2",
    title: "Salicylic acid",
    formula: "C7H6O3",
    smiles: "O=C(O)c1ccccc1O",
    cid: 338
  }
];

// 실제 직렬화 규칙과 동일하게: running 동안 compound는 null이고
// (done/partial/failed 리포트에서만 채워짐), providers에는 pubchem 진단이 먼저 온다.
function record(overrides: Json): Json {
  return {
    search_id: "s1",
    status: "running",
    query: "aspirin",
    detected_type: "name",
    compound: null,
    candidates: [],
    papers: [],
    providers: [PUBCHEM_PROVIDER],
    error: null,
    created_at: "2026-06-11T00:00:00Z",
    completed_at: null,
    ...overrides
  };
}

function fulfillJson(route: Route, body: Json) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

interface ApiHandlers {
  create: () => Json;
  get?: () => Json;
  select?: (candidateId: string) => Json;
}

async function mockApi(page: Page, handlers: ApiHandlers) {
  await page.route("**/chemical-api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname.replace(/^.*\/chemical-api/, "");

    if (method === "POST" && path === "/api/searches") {
      return fulfillJson(route, handlers.create());
    }
    if (method === "POST" && /^\/api\/searches\/[^/]+\/select$/.test(path)) {
      const body = route.request().postDataJSON() as { candidate_id: string };
      if (handlers.select) {
        return fulfillJson(route, handlers.select(body.candidate_id));
      }
    }
    if (method === "GET" && /^\/api\/searches\/[^/]+$/.test(path)) {
      if (handlers.get) return fulfillJson(route, handlers.get());
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "검색을 찾을 수 없습니다." })
    });
  });
}

async function submitQuery(page: Page, query: string) {
  const input = page.getByPlaceholder(/물질명, SMILES/);
  const button = page.getByRole("button", { name: "검색", exact: true });
  // 하이드레이션 전에 fill이 실행되면 React 상태가 비어 버튼이 비활성화된 채 남는다.
  // 버튼이 활성화될 때까지 fill을 재시도해 하이드레이션 경합을 피한다.
  await expect(async () => {
    await input.fill(query);
    await expect(button).toBeEnabled({ timeout: 500 });
  }).toPass({ timeout: 15_000 });
  await button.click();
}

test("직접 흐름: 검색 → running → done, 정렬 토글 동작", async ({ page }) => {
  await mockApi(page, {
    create: () => record({ status: "running" }),
    get: () =>
      record({
        status: "done",
        compound: COMPOUND,
        papers: PAPERS,
        providers: PROVIDERS_OK,
        completed_at: "2026-06-11T00:00:05Z"
      })
  });

  await page.goto("/");
  await submitQuery(page, "aspirin");

  const rows = page.getByTestId("paper-list").getByRole("listitem");
  await expect(rows).toHaveCount(2, { timeout: 15_000 });

  // pubchem 진단 칩: "PubChem 해석"으로 표기되고 논문 건수("0건")는 표시하지 않는다.
  const pubchemChip = page.getByTestId("provider-chip-pubchem");
  await expect(pubchemChip).toContainText("PubChem 해석");
  await expect(pubchemChip).toContainText("완료");
  await expect(pubchemChip).not.toContainText("0건");
  // 논문 출처 칩은 건수를 유지한다.
  await expect(page.getByTestId("provider-chip-semantic_scholar")).toContainText("1건");
  await expect(
    page.getByRole("link", { name: /Aspirin and cardiovascular outcomes/ })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Salicylate chemistry revisited/ })
  ).toBeVisible();

  // 관련도 정렬(기본): p1(score 0.95)이 첫 행
  await expect(rows.first()).toContainText("Aspirin and cardiovascular outcomes");

  // 연도 정렬로 토글: p2(2024)가 첫 행
  await page.getByLabel("정렬 기준").selectOption("year");
  await expect(rows.first()).toContainText("Salicylate chemistry revisited");
});

test("후보 선택 흐름: needs_candidate_selection → 선택 → done", async ({ page }) => {
  let selectedCandidateId: string | null = null;

  await mockApi(page, {
    create: () =>
      record({ status: "needs_candidate_selection", candidates: CANDIDATES }),
    select: (candidateId) => {
      selectedCandidateId = candidateId;
      // running 동안 compound는 아직 null이다.
      return record({ status: "running", candidates: CANDIDATES });
    },
    get: () =>
      record({
        status: "done",
        compound: COMPOUND,
        // 후보 목록은 done 이후에도 레코드에 남는다.
        candidates: CANDIDATES,
        papers: [PAPERS[0]],
        providers: PROVIDERS_OK,
        completed_at: "2026-06-11T00:00:05Z"
      })
  });

  await page.goto("/");
  await submitQuery(page, "C9H8O4");

  await expect(page.getByText("화합물 후보를 선택하세요")).toBeVisible();
  await page.getByRole("button", { name: /Aspirin/ }).first().click();

  await expect(
    page.getByRole("link", { name: /Aspirin and cardiovascular outcomes/ })
  ).toBeVisible({ timeout: 15_000 });
  expect(selectedCandidateId).toBe("c1");
});

test("실패 흐름: failed 상태에서 오류 메시지와 다시 시도 버튼 표시", async ({ page }) => {
  await mockApi(page, {
    create: () =>
      record({
        status: "failed",
        error: "해당 물질을 찾을 수 없습니다. 입력을 확인해 주세요.",
        providers: [
          {
            ...PUBCHEM_PROVIDER,
            status: "empty",
            message: "해당 물질을 찾을 수 없습니다."
          }
        ],
        completed_at: "2026-06-11T00:00:01Z"
      })
  });

  await page.goto("/");
  await submitQuery(page, "definitely-not-a-chemical");

  // Next.js 라우트 어나운서도 role="alert"를 갖기 때문에 testid로 한정한다.
  const banner = page.getByTestId("status-banner");
  await expect(banner).toContainText("검색에 실패했습니다");
  await expect(banner).toContainText("해당 물질을 찾을 수 없습니다");
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
});
