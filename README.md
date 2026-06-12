# Chemical Paper Search

화학물질 기반 논문/특허 검색 서비스. 화학물질 식별 정보(이름, SMILES, InChI, InChIKey, 분자식)를 RDKit과 PubChem으로 정규화한 뒤, 논문은 OpenAlex/Crossref(및 키가 설정된 경우에만 Semantic Scholar)에서, 특허는 Google Patents·SureChEMBL·KIPRIS(한국 특허)에서 검색한다. 논문과 특허는 별도 결과 유형으로 분리해 표시한다.

- 검색 결과는 논문(OpenAlex/Crossref/Semantic Scholar)과 특허(Google Patents/SureChEMBL/KIPRIS)로 나뉜다. 특허 검색은 2026-06-11에 SureChEMBL로 재도입됐고(D-014), 같은 날 한국 특허 검색을 위해 KIPRIS 소스를 추가했으며(D-016), 2026-06-12에 Google Patents를 라이브 관련도 랭킹 provider로 추가했다(D-018). 특허는 논문과 분리된 결과 섹션(특허 탭)으로 노출되며, Google Patents(글로벌·관련도순), SureChEMBL(글로벌·보조), KIPRIS(한국) 특허가 같은 특허 탭에 함께 표시된다. EPO OPS와 ChEMBL 구조 검색은 여전히 범위에서 제외된다(D-010, D-014, `docs/chemical-search-progress/decision-log.md`).
- Google Patents는 비공식 XHR 엔드포인트(`patents.google.com/xhr/query`)로 정규화된 화합물 이름을 관련도순으로 검색한다(공개 API/키 없음, 브라우저 User-Agent 필요). 응답 차단(403/파싱 실패)은 특허 탭을 망가뜨리지 않고 graceful "error" 진단으로 노출되며, SureChEMBL/KIPRIS가 특허 탭을 계속 채운다(D-018). SureChEMBL은 관련도 랭킹은 없지만 화합물→특허 매핑과 특허별 Google Patents 딥링크를 보조 소스로 제공한다(D-009 부분 갱신).
- 한글 물질명 입력을 지원한다(D-015). 질의에 한글이 포함되면 Wikidata로 한글명을 PubChem CID/InChIKey로 해석한 뒤 기존 PubChem 경로로 정규화한다(예: 아스피린 → CID 2244, 카페인 → 2519). Wikidata는 API key가 필요 없다. 다만 브랜드명·통용명 일부(예: 타이레놀, 포도당)는 매칭되지 않을 수 있고, 이 경우 기존 PubChem 이름 조회로 폴백한다.
- KIPRIS 한국 특허 검색은 키워드 기반(화합물 이름으로 검색, 화학 구조 검색 아님)이며 서비스 키가 있을 때만 동작한다(D-016). `KIPRIS_SERVICE_KEY` 미설정 시 KIPRIS 소스는 비활성화된다(오류 아님).
- 백엔드는 Python FastAPI, 프론트엔드는 Next.js다. 브라우저는 Next.js 앱하고만 통신하며, `src/app/chemical-api/[...path]/route.ts` 런타임 프록시 라우트가 같은 출처에서 `/chemical-api/*`를 FastAPI로 포워딩한다(빌드 시점에 URL을 박는 `next.config` rewrite가 아니라 런타임에 `CHEMICAL_API_URL`을 읽음 → URL 변경 시 재빌드 불필요, 동일 출처라 CORS 불필요).
- 앱 전체가 **Supabase 이메일/비밀번호 인증 게이트** 뒤에 있다. 로그인하지 않으면 미들웨어가 모든 경로를 `/login`으로 리다이렉트하고, `/chemical-api/*` 프록시는 401 JSON을 돌려준다. 저장됨(saved)·검색 기록은 Supabase에 사용자별로 저장되며 RLS로 격리된다(`supabase/schema.sql`). 로컬 개발에도 `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`가 필요하다(설정·배포 토폴로지는 [DEPLOYMENT.md](./DEPLOYMENT.md) 참고).

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
- 외부 네트워크 접근: PubChem, Semantic Scholar, Crossref, OpenAlex, Google Patents(`patents.google.com`), SureChEMBL(`www.surechembl.org`), Wikidata(`query.wikidata.org`), KIPRIS Plus(`plus.kipris.or.kr`)
- Google Patents, SureChEMBL, Wikidata(한글 물질명 해석)는 API key가 필요 없다. Google Patents는 비공식 XHR 엔드포인트라 브라우저 User-Agent가 필요하고, 데이터센터 IP(예: 호스팅된 Space)는 차단될 수 있다(이 경우 graceful error로 처리되고 나머지 특허 소스는 정상).
- KIPRIS 한국 특허 검색은 `KIPRIS_SERVICE_KEY`가 설정된 경우에만 동작한다(선택). 미설정 시 KIPRIS 소스는 비활성화되며 나머지 검색은 정상 동작한다.
- KIPRIS 키 발급: `plus.kipris.or.kr` 가입 후 'API KEY 관리'에서 REST AccessKey를 발급받아(무료, 한도 내 사용) `KIPRIS_SERVICE_KEY`에 넣는다. 엔드포인트는 KIPRIS Plus REST `patUtiModInfoSearchSevice/freeSearchInfo`이며, 발급 직후 키 활성화에 시간이 걸릴 수 있다.

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

> 배포(Vercel + 컨테이너 백엔드)는 [DEPLOYMENT.md](./DEPLOYMENT.md) 참고.

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

런타임 프록시 라우트(`src/app/chemical-api/[...path]/route.ts`)가 `/chemical-api/:path*`를 `http://127.0.0.1:8000`으로 포워딩한다(`next.config` rewrite가 아니라 요청 시점에 `CHEMICAL_API_URL`을 읽는다). FastAPI 주소가 다르면 `CHEMICAL_API_URL` 환경 변수로 변경하며, private HF Space를 가리키면 `CHEMICAL_API_TOKEN`도 함께 설정한다(프록시가 `Authorization: Bearer <token>`로 주입). 로컬 백엔드를 인증 없이 띄울 때는 토큰을 비워 둔다.

또한 로컬에서 앱을 열려면 Supabase 인증 게이트를 통과해야 하므로 `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`를 설정하고, Supabase 프로젝트에 `supabase/schema.sql`을 한 번 실행해 둔다(자세한 설정은 [DEPLOYMENT.md](./DEPLOYMENT.md)).

### 주의: 두 서버는 같은 쪽(Windows 또는 WSL)에서 실행

`.venv-chemical`은 Windows Python이므로 FastAPI는 항상 Windows 쪽 `127.0.0.1:8000`에 바인딩된다. Next.js를 WSL에서 실행하면 WSL의 `127.0.0.1:8000`에는 아무것도 없어 검색 시 **HTTP 500**이 발생한다. `npm run dev`도 PowerShell(Windows)에서 실행해 두 서버를 같은 네트워크 스택에 두는 것을 권장한다. (Windows 실행이 콜드 컴파일도 수 배 빠르다.)

또한 uvicorn을 `--reload` 없이 띄운 채 코드를 갱신하면 구버전 프로세스가 옛 API 스키마로 응답한다. 코드 변경 후에는 서버를 재시작하거나 `--reload` 옵션을 유지한다.

## 환경 변수

`.env.example`을 `.env`로 복사해 사용한다.

| 변수 | 위치 | 필수 | 설명 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 프론트(Vercel) | 필수 | Supabase 프로젝트 URL. 인증 게이트와 사용자별 저장/기록에 사용한다. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 프론트(Vercel) | 필수 | Supabase anon(공개) 키. 설계상 공개 키이며(브라우저 노출, 접근 제어는 RLS) `NEXT_PUBLIC` 접두사를 쓴다. |
| `CHEMICAL_API_URL` | 프론트(Vercel) | 선택 | 프록시 라우트가 가리키는 FastAPI(HF Space) 주소. 기본값 `http://127.0.0.1:8000`. 런타임에 읽으므로 변경 시 재빌드 불필요. |
| `CHEMICAL_API_TOKEN` | 프론트(Vercel) | 선택 | private HF Space 호출용 Bearer 토큰(HF read 토큰). 프록시가 서버 측에서 `Authorization: Bearer`로 주입한다. 로컬 비인증 백엔드는 비워 둔다. |
| `SEMANTIC_SCHOLAR_API_KEY` | 백엔드(HF) | 선택 | Semantic Scholar API key. 미설정 시 기본 source에서 제외된다(무인증 호출은 rate limit(HTTP 429)에 걸리기 쉬워 OpenAlex/Crossref가 대체). |
| `CROSSREF_MAILTO` | 백엔드(HF) | 권장 | Crossref polite pool 식별용 이메일 |
| `OPENALEX_MAILTO` | 백엔드(HF) | 선택 | OpenAlex polite pool 식별용 이메일. 미설정 시 `CROSSREF_MAILTO`를 사용한다. |
| `CHEMICAL_SEARCH_CACHE_DIR` | 백엔드(HF) | 선택 | provider 응답 캐시 디렉터리. 기본값 `output/chemical-search/cache` |
| `KIPRIS_SERVICE_KEY` | 백엔드(HF) | 선택 | 한국 특허(KIPRIS) 검색용 KIPRIS Plus REST AccessKey. `plus.kipris.or.kr` 'API KEY 관리'에서 발급한다. 미설정 시 KIPRIS 소스는 비활성화된다(오류 아님). 한글 물질명 입력(Wikidata)에는 키가 필요 없다. |

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
