# Chemical Paper Search

화학물질 기반 논문/특허 검색 서비스. 화학물질 식별 정보(이름, SMILES, InChI, InChIKey, 분자식)를 RDKit과 PubChem으로 정규화한 뒤, 논문은 Semantic Scholar, Crossref, OpenAlex에서, 특허는 SureChEMBL에서 검색한다. 논문과 특허는 별도 결과 유형으로 분리해 표시한다.

- 검색 결과는 논문(Semantic Scholar/Crossref/OpenAlex)과 특허(SureChEMBL)로 나뉜다. 특허 검색은 2026-06-11에 SureChEMBL로 재도입됐고(D-014), 논문과 분리된 결과 섹션으로 노출된다. EPO OPS와 ChEMBL 구조 검색은 여전히 범위에서 제외된다(D-010, D-014, `docs/chemical-search-progress/decision-log.md`).
- SureChEMBL은 화합물→특허 매핑과 함께 특허별 Google Patents 딥링크를 제공한다(D-009 부분 갱신).
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
- 외부 네트워크 접근: PubChem, Semantic Scholar, Crossref, OpenAlex, SureChEMBL(`www.surechembl.org`)
- SureChEMBL은 API key가 필요 없으므로 특허 검색용 신규 환경 변수는 추가하지 않는다.

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

### 주의: 두 서버는 같은 쪽(Windows 또는 WSL)에서 실행

`.venv-chemical`은 Windows Python이므로 FastAPI는 항상 Windows 쪽 `127.0.0.1:8000`에 바인딩된다. Next.js를 WSL에서 실행하면 WSL의 `127.0.0.1:8000`에는 아무것도 없어 검색 시 **HTTP 500**이 발생한다. `npm run dev`도 PowerShell(Windows)에서 실행해 두 서버를 같은 네트워크 스택에 두는 것을 권장한다. (Windows 실행이 콜드 컴파일도 수 배 빠르다.)

또한 uvicorn을 `--reload` 없이 띄운 채 코드를 갱신하면 구버전 프로세스가 옛 API 스키마로 응답한다. 코드 변경 후에는 서버를 재시작하거나 `--reload` 옵션을 유지한다.

## 환경 변수

`.env.example`을 `.env`로 복사해 사용한다.

| 변수 | 필수 | 설명 |
|---|---|---|
| `SEMANTIC_SCHOLAR_API_KEY` | 선택 | Semantic Scholar API key. 신규 발급이 사실상 중단되어 보통 무인증 best-effort로 호출하며, 이때 rate limit(HTTP 429)에 걸리기 쉽다. |
| `CROSSREF_MAILTO` | 권장 | Crossref polite pool 식별용 이메일 |
| `OPENALEX_MAILTO` | 선택 | OpenAlex polite pool 식별용 이메일. 미설정 시 `CROSSREF_MAILTO`를 사용한다. |
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
