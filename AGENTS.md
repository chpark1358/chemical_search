## graphify

When this project has a Graphify graph at `.graphify/graph_report.md`, prefer the graph before broad raw file search.

Rules:
- Read `.graphify/graph_report.md` before architecture or cross-module codebase searches.
- Use `nodesify-graphify query "<question>"`, `nodesify-graphify path "<A>" "<B>"`, or `nodesify-graphify explain "<concept>"` for cross-module questions when the graph exists.
- Read individual source files directly when exact implementation details are needed or graph output is insufficient.
- After modifying code files while a graph exists, run `nodesify-graphify update .`.
- If there is no `.graphify/graph_report.md`, build the graph first with `/graphify` or `nodesify-graphify run .`.

## 프로젝트 개요

화학물질(이름/SMILES/InChI/InChIKey/분자식)을 RDKit+PubChem으로 정규화해 Semantic Scholar와 Crossref에서 논문을 검색하는 논문 전용(papers-only) 도구다. 특허 검색과 ChEMBL 구조 검색은 범위에서 제외됐다(D-010).

## 구조

- `src/`: Next.js UI. 루트 라우트 `/`에 Linear 스타일 다크 테마 검색 화면
- `scripts/chemical_search/`: Python FastAPI 백엔드. 입력 감지, RDKit 정규화, provider adapter, 검색 API
- `tests/`: Python unittest(`test_chemical_search*.py`)와 Playwright smoke 테스트
- `docs/chemical-search-progress/`: 개발 진행 기록. 작업 종료 시 갱신 의무가 있다

## 검증 명령

Python API 실행:

```bash
.venv-chemical/Scripts/python.exe -m uvicorn --app-dir scripts chemical_search.api:app --reload --port 8000
```

PowerShell에서는 `.venv-chemical\Scripts\python.exe`를 사용한다.

웹 실행:

```bash
npm run dev
```

`/chemical-api/:path*`는 `next.config.ts` rewrite로 `http://127.0.0.1:8000`에 프록시된다. 대상 주소는 `CHEMICAL_API_URL`로 변경한다.

Python 테스트:

```bash
.venv-chemical/Scripts/python.exe -m unittest discover -s tests -p "test_chemical_search*.py"
```

웹 lint/테스트:

```bash
npm run lint
npm run test:smoke
```

## 작업 종료 시 문서 갱신 의무

작업 하나가 끝날 때마다 `docs/chemical-search-progress/README.md`의 "작업 종료 시 필수 업데이트" 규칙에 따라 다음 6종 문서를 갱신한다.

1. `docs/chemical-search-progress/current-status.md`
2. `docs/chemical-search-progress/progress-log.md`
3. `docs/chemical-search-progress/phase-status.md`
4. `docs/chemical-search-progress/decision-log.md` (새 결정이 있는 경우)
5. `docs/chemical-search-progress/open-issues.md`
6. `docs/chemical-search-progress/session-reports/YYYY-MM-DD-작업명.md` (신규 생성)
