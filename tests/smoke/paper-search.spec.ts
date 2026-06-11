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
  },
  {
    name: "openalex",
    status: "ok",
    latency_ms: 500,
    cached: false,
    retry_count: 0,
    message: null
  },
  {
    name: "surechembl",
    status: "ok",
    latency_ms: 640,
    cached: false,
    retry_count: 0,
    message: null
  },
  {
    name: "kipris",
    status: "ok",
    latency_ms: 720,
    cached: false,
    retry_count: 0,
    message: null
  }
];

const PATENTS: Json[] = [
  {
    id: "CN-102369480-A",
    publication_number: "CN102369480A",
    title: "Aspirin sustained-release composition",
    url: "https://patents.google.com/patent/CN102369480A/en",
    assignee: "Example Pharma Co",
    date: "2012-03-07",
    source: "surechembl"
  },
  {
    id: "US-1234567-A",
    publication_number: "US1234567A",
    title: "Process for preparing acetylsalicylic acid",
    url: "https://patents.google.com/patent/US1234567A/en",
    assignee: null,
    date: null,
    source: "surechembl"
  },
  {
    id: "KR-1020200012345-A",
    publication_number: "1020200012345",
    title: "아스피린 서방성 조성물 및 그 제조방법",
    url: "https://www.kipris.or.kr/khome/search/searchResult.do?word=아스피린",
    assignee: "한국제약 주식회사",
    date: "2020-01-01",
    source: "kipris"
  }
];

const PATENTS_TOTAL_HITS = 692924;

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
  },
  {
    id: "https://openalex.org/W3",
    title: "Acetylsalicylic acid pharmacokinetics",
    authors: ["D. Choi"],
    venue: "Br J Clin Pharmacol",
    year: 2021,
    doi: "10.1000/aspirin.3",
    url: "https://doi.org/10.1000/aspirin.3",
    citations: 87,
    abstract: "Aspirin pharmacokinetics across populations.",
    source: "openalex",
    score: 0.62
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
    patents: [],
    patents_total_hits: null,
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
  const input = page.getByPlaceholder(/물질명.*SMILES/);
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
        patents: PATENTS,
        patents_total_hits: PATENTS_TOTAL_HITS,
        providers: PROVIDERS_OK,
        completed_at: "2026-06-11T00:00:05Z"
      })
  });

  await page.goto("/");
  await submitQuery(page, "aspirin");

  const rows = page.getByTestId("paper-list").getByRole("listitem");
  await expect(rows).toHaveCount(3, { timeout: 15_000 });

  // pubchem 진단 칩: "PubChem 해석"으로 표기되고 논문 건수("0건")는 표시하지 않는다.
  const pubchemChip = page.getByTestId("provider-chip-pubchem");
  await expect(pubchemChip).toContainText("PubChem 해석");
  await expect(pubchemChip).toContainText("완료");
  await expect(pubchemChip).not.toContainText("0건");
  // 논문 출처 칩은 건수를 유지한다.
  await expect(page.getByTestId("provider-chip-semantic_scholar")).toContainText("1건");
  const openalexChip = page.getByTestId("provider-chip-openalex");
  await expect(openalexChip).toContainText("OpenAlex");
  await expect(openalexChip).toContainText("1건");
  // SureChEMBL은 특허 출처이므로 특허 건수(source==="surechembl")를 보여준다.
  const surechemblChip = page.getByTestId("provider-chip-surechembl");
  await expect(surechemblChip).toContainText("SureChEMBL");
  await expect(surechemblChip).toContainText("2건");
  // KIPRIS도 특허 출처이며, source==="kipris" 특허 건수(1건)를 보여준다.
  const kiprisChip = page.getByTestId("provider-chip-kipris");
  await expect(kiprisChip).toContainText("KIPRIS");
  await expect(kiprisChip).toContainText("1건");
  await expect(
    page.getByRole("link", { name: /Aspirin and cardiovascular outcomes/ })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Salicylate chemistry revisited/ })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Acetylsalicylic acid pharmacokinetics/ })
  ).toBeVisible();

  // 관련도 정렬(기본): p1(score 0.95)이 첫 행
  await expect(rows.first()).toContainText("Aspirin and cardiovascular outcomes");

  // 연도 정렬로 토글: p2(2024)가 첫 행
  await page.getByLabel("정렬 기준").selectOption("year");
  await expect(rows.first()).toContainText("Salicylate chemistry revisited");

  // OpenAlex 출처 필터: openalex 논문만 남는다.
  await page.getByRole("button", { name: "OpenAlex", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Acetylsalicylic acid pharmacokinetics");
  await expect(
    page.getByRole("link", { name: /Aspirin and cardiovascular outcomes/ })
  ).toHaveCount(0);

  // 전체 필터로 복귀하면 모든 논문이 다시 보인다.
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await expect(rows).toHaveCount(3);

  // 결과 탭: 기본은 논문 탭이고 특허 탭에는 특허 건수가 표시된다.
  const patentTab = page.getByTestId("result-tab-patents");
  await expect(patentTab).toContainText("특허");
  await expect(patentTab).toContainText("3");
  await expect(page.getByTestId("result-tab-papers")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  // 특허 탭으로 전환하면 특허 행과 Google Patents 외부 링크가 렌더된다.
  await patentTab.click();
  const patentList = page.getByTestId("patent-list");
  const patentRows = patentList.getByRole("listitem");
  await expect(patentRows).toHaveCount(3);
  await expect(patentRows.first()).toContainText("CN102369480A");
  const patentLink = page.getByRole("link", {
    name: /Aspirin sustained-release composition/
  });
  await expect(patentLink).toBeVisible();
  await expect(patentLink).toHaveAttribute(
    "href",
    "https://patents.google.com/patent/CN102369480A/en"
  );
  await expect(patentLink).toHaveAttribute("target", "_blank");
  // 특허 행에는 출처 배지가 표시된다: SureChEMBL 특허와 KIPRIS(한글 특허) 모두.
  await expect(patentList.getByText("SureChEMBL", { exact: true }).first()).toBeVisible();
  await expect(patentList.getByText("KIPRIS", { exact: true }).first()).toBeVisible();
  // KIPRIS 한글 특허 행이 렌더되고 외부 링크가 KIPRIS로 연결된다.
  const kiprisLink = page.getByRole("link", { name: /아스피린 서방성 조성물/ });
  await expect(kiprisLink).toBeVisible();
  await expect(kiprisLink).toHaveAttribute(
    "href",
    "https://www.kipris.or.kr/khome/search/searchResult.do?word=아스피린"
  );
  // 상위/전체 건수 헤더가 표시된다.
  await expect(page.getByText(/전체\s+692,924\s*건/)).toBeVisible();
});

test("유휴 상태: 한글 예시 칩(아스피린)이 표시된다", async ({ page }) => {
  await mockApi(page, {
    create: () => record({ status: "running" })
  });

  await page.goto("/");
  // 히어로 예시 칩에 한글 물질명 입력 예시가 포함된다.
  await expect(
    page.getByRole("button", { name: "아스피린", exact: true })
  ).toBeVisible();
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
