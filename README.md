# Chemical Paper Search

화학물질 기반 논문 검색 서비스. 화학물질 식별 정보(이름, SMILES, InChI, InChIKey, 분자식)를 RDKit과 PubChem으로 정규화한 뒤, Semantic Scholar와 Crossref에서 관련 논문을 검색한다.

- 검색 대상은 논문 전용(papers-only)이다. 특허 검색과 ChEMBL 구조 검색은 범위에서 제외됐다(D-010, `docs/chemical-search-progress/decision-log.md`).
- 백엔드는 Python FastAPI, 프론트엔드는 Next.js다. Next.js rewrite(`/chemical-api`)로 같은 출처에서 FastAPI를 호출한다.

## 저장소 구조

| 경로 | 설명 |
|---|---|
| `src/` | Next.js UI. 루트 라우트 `/`의 Linear 스타일 다크 테마 검색 화면 |
| `scripts/chemical_search/` | Python FastAPI 검색 파이프라인. 입력 감지, RDKit 정규화, provider adapter, 검색 API |
| `tests/` | Python 단위/계약 테스트(`test_chemical_search*.py`)와 Playwright smoke 테스트 |
| `docs/` | 기획 문서와 개발 진행 기록 |

## 사전 요구사항

- Node.js 20 이상, npm
- Python 3.11
- 외부 네트워크 접근: PubChem, Semantic Scholar, Crossref

## 설치

### 1. Node 의존성

```bash
npm install
```

### 2. Python venv

PowerShell(Windows):

```powershell
& scripts\chemical_search\setup-poc.ps1
```

bash/WSL 대안:

```bash
python3.11 -m venv .venv-chemical
.venv-chemical/bin/python -m pip install --upgrade pip
.venv-chemical/bin/python -m pip install -r scripts/chemical_search/requirements-poc.txt
```

참고: PowerShell 스크립트로 만든 venv는 `.venv-chemical/Scripts/python.exe`, bash로 만든 venv는 `.venv-chemical/bin/python`을 사용한다. 아래 명령은 Windows venv 기준이며, Linux venv에서는 `Scripts/python.exe`를 `bin/python`으로 바꾼다.

## 실행

Python API와 Next.js 웹 서버를 각각 실행한다.

### Python API (FastAPI, 포트 8000)

```bash
.venv-chemical/Scripts/python.exe -m uvicorn --app-dir scripts chemical_search.api:app --reload --port 8000
```

PowerShell:

```powershell
.venv-chemical\Scripts\python.exe -m uvicorn --app-dir scripts chemical_search.api:app --reload --port 8000
```

OpenAPI 문서: `http://127.0.0.1:8000/docs`

### Next.js 웹 (포트 3000)

```bash
npm run dev
```

`next.config.ts`의 rewrite가 `/chemical-api/:path*`를 `http://127.0.0.1:8000`으로 프록시한다. FastAPI 주소가 다르면 `CHEMICAL_API_URL` 환경 변수로 변경한다.

## 환경 변수

`.env.example`을 `.env`로 복사해 사용한다.

| 변수 | 필수 | 설명 |
|---|---|---|
| `SEMANTIC_SCHOLAR_API_KEY` | 선택 | Semantic Scholar API key. 없으면 무인증 호출로 rate limit(HTTP 429)에 걸리기 쉽다. |
| `CROSSREF_MAILTO` | 권장 | Crossref polite pool 식별용 이메일 |
| `CHEMICAL_SEARCH_CACHE_DIR` | 선택 | provider 응답 캐시 디렉터리. 기본값 `output/chemical-search/cache` |
| `CHEMICAL_API_URL` | 선택 | Next.js rewrite 대상 FastAPI 주소. 기본값 `http://127.0.0.1:8000` |

## 테스트

Python:

```bash
.venv-chemical/Scripts/python.exe -m unittest discover -s tests -p "test_chemical_search*.py"
```

웹:

```bash
npm run lint
npm run test:smoke
```

## 개발 진행 문서

현재 상태, 단계별 진행률, 의사결정, 오픈 이슈는 [docs/chemical-search-progress/](docs/chemical-search-progress/README.md)에 기록한다.
