# 의사결정 로그

## D-001: 진행 상황 문서를 기능별로 분리한다

날짜: 2026-06-02
상태: 확정

### 결정

개발 진행 기록은 단일 문서가 아니라 다음 문서들로 분리한다.

- 현재 상태: `current-status.md`
- 단계별 진행률: `phase-status.md`
- 누적 로그: `progress-log.md`
- 결정 기록: `decision-log.md`
- 미해결 이슈: `open-issues.md`
- 작업별 종료 보고서: `session-reports/*.md`

### 이유

단일 로그 파일만 사용하면 시간이 지나면서 현재 상태, 과거 작업, 결정 이유, 미해결 이슈가 섞인다. 개발 착수 후에는 "현재 어디까지 됐는지"와 "왜 이렇게 결정했는지"를 빠르게 분리해서 봐야 한다.

### 영향

작업 종료마다 여러 문서를 갱신해야 하지만, 추적 가능성과 인수인계 품질이 올라간다.

## D-002: 작업 종료 시 개별 종료 보고서를 만든다

날짜: 2026-06-02
상태: 확정

### 결정

작업 하나가 끝날 때마다 `session-reports/YYYY-MM-DD-작업명.md` 파일을 새로 만든다.

### 이유

누적 로그는 요약에 적합하지만, 특정 작업의 상세 맥락과 검증 결과를 보존하기에는 부족하다.

### 영향

각 작업의 변경 파일, 검증 결과, 남은 리스크를 나중에 독립적으로 확인할 수 있다.

## D-003: 개발 단계는 POC, MVP-1, MVP-2로 분리한다

날짜: 2026-06-02
상태: 확정

### 결정

초기 개발은 바로 전체 MVP를 만들지 않고 다음 순서로 진행한다.

1. Phase 0: 기술 검증
2. Phase 1: POC
3. Phase 2: MVP-1
4. Phase 3: MVP-2

### 이유

외부 API와 화학 구조 검색 정확도를 검증하지 않은 상태에서 UI, 특허 검색, AI 요약까지 동시에 구현하면 일정과 품질 리스크가 크다.

### 영향

초기에는 기능 수를 줄이고, 검증 가능한 검색 품질부터 확보한다.
## D-004: Phase 0 spike는 provider 실패를 리포트하되 기본 종료 코드는 성공으로 둔다

날짜: 2026-06-02
상태: 확정

### 결정

`phase0_api_spike.py`는 기본 실행에서 외부 provider 일부가 실패해도 JSON/Markdown 리포트를 생성하고 exit code 0으로 종료한다. 모든 provider 실패를 CI 실패처럼 다뤄야 할 때는 `--strict` 옵션을 사용한다.

### 이유

Phase 0의 목적은 provider의 실제 상태를 발견하고 기록하는 것이다. Semantic Scholar rate limit, SureChEMBL TLS 문제, EPO OPS credential 미설정은 개발자가 고쳐야 할 코드 버그가 아니라 go/no-go 판단 대상이다.

### 영향

자동화 실행에서 리포트가 안정적으로 남는다. 단, 배포 전 검증에는 `--strict`를 사용할 수 있다.

## D-005: RDKit은 우선 현재 Python 사용자 환경에 설치해 Phase 0을 진행한다

날짜: 2026-06-02
상태: 임시 확정

### 결정

현재 Windows Python 3.11 사용자 환경에 `rdkit==2026.3.2`를 설치해 Phase 0 정규화 검증을 진행했다.

### 이유

Phase 0은 빠른 검증이 목적이므로 Docker/conda 환경 분리보다 즉시 실행 가능한 방식이 적합하다.

### 영향

POC 이후에는 재현 가능한 개발 환경을 위해 venv, conda, Docker 중 하나로 고정해야 한다.

## D-006: Phase 1 POC는 Python CLI와 공통 ProviderResult 계약으로 구현한다

날짜: 2026-06-10
상태: 확정

### 결정

Phase 1은 웹 UI를 만들기 전에 Python CLI로 구현한다. 입력 감지, RDKit 정규화, provider adapter, 검색 파이프라인, 결과 렌더링을 분리하고 모든 provider는 공통 `ProviderResult` 형식을 반환한다.

### 이유

외부 API의 rate limit과 장애를 UI 구현과 분리해 검증할 수 있고, provider 하나가 실패해도 나머지 결과를 partial로 유지하기 쉽다.

### 영향

Phase 2 웹 API는 현재 파이프라인을 호출하는 얇은 계층으로 설계할 수 있다. provider별 cache/throttle/retry와 결과 병합은 다음 단계에서 추가해야 한다.

## D-007: Phase 2는 결과 계약과 provider 안정화를 UI보다 먼저 구현한다

날짜: 2026-06-10
상태: 확정

### 결정

Phase 2 구현 순서를 `provider 안정화 -> 결과 병합/랭킹/evidence -> 검색 API -> 웹 UI/Ketcher`로 변경한다.

### 이유

결과 계약이 고정되기 전에 API와 UI를 만들면 provider 장애 처리, 중복 제거, ranking 추가 시 응답 형식과 화면을 반복 수정해야 한다.

### 영향

웹 UI 착수는 늦어지지만 API/UI 재작업을 줄이고 같은 입력에 대한 결과 재현성과 테스트 가능성을 높인다.

## D-008: RDKit 검색 백엔드는 FastAPI 서비스로 분리한다

날짜: 2026-06-10
상태: 확정

### 결정

RDKit 정규화, provider adapter, 검색 상태, 결과 병합은 Python FastAPI 서비스에 둔다. Next.js는 FastAPI를 호출하는 프론트엔드로 사용하며 Python 프로세스를 Next.js route에서 직접 실행하지 않는다.

### 이유

RDKit과 현재 검색 파이프라인이 Python 기반이고, 프로세스 직접 실행 방식은 요청 수명, 오류 처리, 배포, 상태 저장에 취약하다.

### 영향

로컬 개발에서는 Next.js와 FastAPI를 별도 프로세스로 실행한다. 현재 검색 상태는 인메모리이며 MVP-1 운영 전 PostgreSQL/Redis 또는 job queue로 교체해야 한다.

## D-009: Google Patents는 우선 외부 검색 링크로 통합한다

날짜: 2026-06-10
상태: 확정

### 결정

선택된 정규화 화합물의 이름, 분자식, InChIKey를 조합한 Google Patents 검색 링크를 제공한다. Google Patents 웹 검색 결과를 직접 스크래핑해 provider 결과로 병합하지 않는다.

### 이유

Google Patents 웹 검색은 사람이 조사하기에는 유용하지만 일반 검색 결과용 공개 API 계약이 명확하지 않다. 자동 수집은 웹 화면 스크래핑보다 Google Patents Public Datasets의 BigQuery 연동이 안정적이다.

### 영향

MVP-1 사용자는 Chemical Search 결과에서 Google Patents로 바로 이동할 수 있다. 특허 결과 자동 수집과 evidence 병합은 BigQuery 비용, 인증, 쿼리 범위를 검증한 뒤 MVP-2 provider로 구현한다.

## D-010: 제품 스코프를 논문 전용(papers-only)으로 축소한다

날짜: 2026-06-11
상태: 확정

### 결정

특허 검색(SureChEMBL, EPO OPS, Google Patents 링크)과 ChEMBL 구조 검색(exact/similarity/substructure)을 제품 범위에서 제거한다. 파이프라인은 화학물질 입력(name/SMILES/InChI/InChIKey/formula)을 RDKit+PubChem으로 정규화하고, Semantic Scholar와 Crossref에서 논문만 검색한다.

### 이유

사용자 요구. 제품 목적을 "화학물질 기반 논문 검색" 하나로 좁혀 가치 검증에 집중한다. 특허 검색은 SureChEMBL TLS 장애(O-002)와 EPO OPS 인증 미해결(O-003)로 불확실성이 컸고, ChEMBL 구조 검색은 논문 탐색이라는 핵심 흐름에 필수가 아니다.

### 영향

pipeline/api/UI 재작업이 필요하다. 검색 상태값은 `needs_candidate_selection | running | done | partial | failed`로 단순화되고(`partial_failed`는 `partial`로 개명), similarity threshold와 ChEMBL 관련 파라미터는 제거된다. 이전 Phase 2 산출물 중 ChEMBL/특허 부분은 제거 대상이며, O-002/O-003은 범위 제외로 종결한다.

## D-011: UI를 Linear 스타일로 재설계하고 루트 라우트로 이동한다

날짜: 2026-06-11
상태: 확정

### 결정

getdesign.md의 linear.app DESIGN.md를 기반으로 다크 테마 UI(캔버스 `#010102`, 라벤더 `#5e6ad2` 액센트, Inter + JetBrains Mono)를 새로 구현하고, 검색 화면을 기존 `/chemical` 라우트에서 루트 라우트 `/`로 이동한다.

### 이유

월드컵 앱 제거(D-012) 이후 저장소는 논문 검색 단일 제품이므로 `/chemical` 분리 라우트를 유지할 이유가 없다. 기존 UI는 ChEMBL 검색 모드와 threshold 등 제거된 기능을 전제로 설계되어 papers-only 계약에 맞게 재설계하는 편이 수정보다 빠르다.

### 영향

루트 페이지와 컴포넌트를 새로 작성하고 `/chemical` 라우트는 제거한다. FastAPI 엔드포인트 경로는 유지하되 record 스키마는 papers-only로 변경된다. `next.config.ts`의 `/chemical-api` rewrite는 그대로 유지한다.

## D-012: 월드컵 앱을 저장소에서 제거한다

날짜: 2026-06-11
상태: 확정

### 결정

ideal-worldcup Next.js 앱(라우트, API, 관련 문서)을 저장소에서 제거했다. 제거 커밋은 `9cd47e2`이며, 필요하면 git 히스토리에서 복원할 수 있다.

### 이유

저장소를 화학물질 논문 검색 단일 제품으로 운영한다. 두 제품이 한 저장소에 있으면 의존성, 환경 변수, lint/테스트 명령이 섞여 검증 기준이 불명확해진다. 실제로 월드컵 앱의 lint/smoke 실패가 진행 기록에 노이즈로 남아 있었다.

### 영향

`src/`는 Chemical Search UI만 남는다. `DATABASE_URL`, `STORAGE_*`, `ADMIN_SESSION_SECRET` 등 월드컵용 환경 변수는 `.env.example`에서 제거한다. 제거 직전 상태는 베이스라인 커밋 `1c45ee5`와 git 히스토리로 추적한다.

## D-013: OpenAlex 논문 소스를 추가한다

날짜: 2026-06-11
상태: 확정

### 결정

OpenAlex(`https://api.openalex.org/works`)를 Crossref와 함께 주력 논문 소스로 추가한다. 유효 소스는 `semantic_scholar | crossref | openalex` 3개가 되고, `sources` 미지정 시 기본값은 3개 전체다. Semantic Scholar는 무인증 best-effort provider로 유지한다.

### 이유

Semantic Scholar가 무료 도메인 이메일과 서드파티 앱에 대한 API key 신규 발급을 중단해(2024-09 공식 X 공지, 2025년까지 승인 정체) 무인증 호출의 HTTP 429가 상시 발생한다(O-007). OpenAlex는 API key가 필요 없고, `mailto` 지정 시 polite pool로 10 rps / 일 100k 요청을 보장한다.

### 영향

provider adapter, 검색 파이프라인, UI 소스 칩·필터에 OpenAlex를 추가해야 한다. 결과 병합(중복 제거) 시 메타데이터 풍부도 기준 우선순위는 `semantic_scholar > openalex > crossref`로 정의하고, 기존 citations/abstract/venue/doi/url/year backfill 동작은 유지한다. 환경 변수 `OPENALEX_MAILTO`가 추가된다(미설정 시 `CROSSREF_MAILTO` 사용, 둘 다 없으면 mailto 파라미터 생략).

## D-014: 특허 검색을 SureChEMBL로 재도입하고 논문과 분리해 표시한다

날짜: 2026-06-11
상태: 확정

### 결정

특허 검색을 SureChEMBL provider로 재도입한다. 특허는 논문(Semantic Scholar/Crossref/OpenAlex)과 분리된 별도 결과 유형으로 표시한다. 새 source 이름은 `surechembl`(특허 소스)이며, `sources` 미지정 시 기본값은 논문 3소스 + `surechembl` 전체다. 이미 PubChem+RDKit으로 정규화된 화합물에서 SureChEMBL `chemical_id`를 resolve(SMILES 우선, name fallback)한 뒤 해당 화합물의 특허 문서를 조회한다.

### 이유

사용자 요구. 사용자가 논문과 특허를 분리해서 보길 명시적으로 요청했다. 2026-06-11 SureChEMBL을 라이브로 재검증한 결과 TLS가 정상이고(`https://www.surechembl.org/api` 접근 가능), `/api/v3/api-docs`로 OpenAPI가 문서화돼 있으며, API key 없이 화합물→특허 매핑과 특허별 Google Patents 딥링크를 얻을 수 있다. 이전 특허 블로커였던 SureChEMBL TLS 장애(O-002)와 EPO OPS 인증 미해결(O-003) 중 SureChEMBL은 해소됐다.

### 범위

SureChEMBL만 추가한다. EPO OPS와 ChEMBL 구조 검색(exact/similarity/substructure)은 여전히 제외한다. Google Patents 자동 수집은 추가하지 않고, SureChEMBL이 제공하는 특허별 Google Patents 딥링크만 사용한다.

### 영향

- `SearchRecord`에 특허 결과 배열 `patents[]`와 `patents_total_hits`(SureChEMBL `total_hits`, "상위 N건 / 전체 N건" 표시용, 미검색 시 null)를 추가한다. `patents[]`의 각 항목은 `{id, publication_number, title, url, assignee, date, source:"surechembl"}` 형태다.
- `providers[]` 진단 배열에 `surechembl`이 추가된다(`status`/`latency_ms`/`cached`/`retry_count`/`message`).
- UI는 논문/특허를 분리된 탭(결과 섹션)으로 표시한다.
- 검색 상태(done/partial/failed) 판정이 논문·특허 두 결과 유형을 모두 포괄하도록 갱신된다. 모든 곳이 비어 있어도 기존 관례대로 빈 배열과 함께 `done`이다.
- API key는 추가되지 않는다(SureChEMBL keyless).
- 이 결정은 D-009(Google Patents 링크아웃)와 D-010(특허 제외)을 부분 갱신한다. D-009의 통합 검색 링크 대신 특허별 딥링크를 사용하고, D-010의 특허 제외 중 SureChEMBL 부분을 되돌린다(EPO OPS/ChEMBL 구조검색 제외는 유지).

## D-015: 한글 물질명 입력을 Wikidata로 해석한다(키 불필요)

날짜: 2026-06-11
상태: 확정

### 결정

질의에 한글(U+AC00..U+D7A3)이 포함되고 입력 유형이 `auto` 또는 `name`이면, 기존 PubChem 이름 조회 이전에 Wikidata SPARQL로 한글 물질명을 PubChem 식별자로 해석한다. Wikidata가 InChIKey를 반환하면 기존 PubChem InChIKey 해석 경로를 재사용하고, CID만 반환하면 PubChem CID 조회로 정규화한다. 매칭 실패 시 기존 PubChem 이름 조회로 폴백한다. Wikidata는 API key가 필요 없으며, 공용 HttpClient(cache/throttle)와 전용 User-Agent로 호출한다.

### 이유

사용자 요구. 사용자가 아스피린·카페인 등 한글 물질명으로 검색할 수 있어야 한다고 요청했다. Wikidata는 한글 라벨(label/altLabel)에 PubChem CID(P662)와 InChIKey(P235)를 연결하고 있어 키 없이 한글명→PubChem 해석이 가능하다(라이브 검증: 아스피린→CID 2244 / BSYNRYMUTXBXSQ-UHFFFAOYSA-N, 카페인→2519, 이부프로펜→3672, 아세트아미노펜→1983).

### 한계

브랜드명·통용명 일부(예: 타이레놀, 포도당)는 Wikidata에 PubChem CID 매핑이 없어 미매칭된다. 이 경우 한글 그대로 기존 PubChem 이름 조회로 폴백하며, 대개 실패해 기존의 친절한 "찾을 수 없음" 안내로 이어진다.

### 영향

- 입력 해석 경로에 한글 사전 해석 단계가 추가된다. 영문/SMILES/InChI/InChIKey/분자식 입력 동작은 변경되지 않는다(회귀 금지).
- Wikidata로 한글명을 해석한 경우 `compound.warnings`에 해석 안내(예: "한글 물질명 '<NAME>'을 Wikidata로 해석했습니다 (PubChem CID <cid>).")를 추가한다.
- `query.wikidata.org` throttle 항목(>=1.0s, polite)과 User-Agent를 추가한다.
- 환경 변수는 추가되지 않는다(Wikidata keyless).

## D-016: 한국 특허 검색을 KIPRIS로 추가한다(키 게이트)

날짜: 2026-06-11
상태: 확정

### 결정

한국 특허 검색을 위해 새 특허 source `kipris`를 추가한다. KIPRIS Plus REST API의 단어 검색 오퍼레이션 `freeSearchInfo`(엔드포인트 `http://plus.kipris.or.kr/openapi/rest/patUtiModInfoSearchSevice/freeSearchInfo`)를 사용하며, 사용자 입력이 한글이면 한글명, 아니면 `compound.name`을 키워드(`word`)로 검색한다(특허+실용신안 포함). KIPRIS는 환경 변수 `KIPRIS_SERVICE_KEY`가 설정된 경우에만 동작하고, 미설정 시 provider가 비활성화된다(오류 아님, `providers[]`/`patents[]`에서 제외, 키 없을 때 기본 source에도 미포함). 특허는 논문과 분리된 특허 탭에 SureChEMBL(글로벌)과 함께 표시된다.

### 이유

사용자 요구. 사용자가 한국 특허를 함께 보길 요청했다. KIPRIS Plus REST API는 한글 키워드로 한국 특허/실용신안을 조회할 수 있는 공개 API다. 인증은 KIPRIS Plus가 발급하는 "REST AccessKey"로 하며, plus.kipris.or.kr 가입 후 'API KEY 관리'에서 발급받는다(data.go.kr 활용신청이 아니다). 발급받은 AccessKey는 환경 변수 `KIPRIS_SERVICE_KEY`에 넣는다(변수 이름은 그대로 유지).

### 한계

- 키워드(화합물 이름) 기반 검색이며 화학 구조 검색이 아니다.
- KIPRIS Plus AccessKey가 필요하고, 키 발급 전에는 비활성 상태로만 둔다.
- 응답이 KIPRIS XML envelope라 방어적으로 파싱한다. 성공은 `resultCode == "00"`로 판정한다(KIPRIS Plus에는 `successYN` 필드가 없다). `resultCode != "00"`이면 error로 분류하고 `resultMsg`를 로깅한다(클라이언트에는 sanitize).

### 영향

- 특허 source에 `kipris`가 추가된다. 요청 파라미터는 `word`, `patent=true`, `utility=true`, `pageNo=1`, `numOfRows`, `accessKey`다. 응답의 행은 body/items 아래 `<PatentUtilityInfo>` 요소이며, 전체 건수는 `<count>` 요소 안의 `<TotalSearchCount>`다. `PatentItem` 매핑: title=InventionName, assignee=Applicant, publication_number=PublicNumber 또는 OpeningNumber 또는 RegistrationNumber 또는 ApplicationNumber, date=ApplicationDate(8자리 YYYYMMDD면 YYYY-MM-DD로 변환), source="kipris", url=번호 숫자로 구성한 Google Patents KR 링크(번호가 없으면 KIPRIS 검색 URL로 폴백). KIPRIS의 `TotalSearchCount`를 kipris의 `patents_total_hits` 기여분으로 잡고, SureChEMBL의 값과 합산한다.
- 환경 변수 `KIPRIS_SERVICE_KEY`가 추가된다(선택, KIPRIS Plus AccessKey). 키가 없으면 KIPRIS는 기본 source에 포함되지 않고 결과/진단에서 빠진다.
- 특허 탭에 SureChEMBL과 KIPRIS 특허가 동시에 표시된다.
- 병합 후 특허 목록은 더 이상 `limit`로 전역 캡을 걸지 않는다. 각 특허 source가 최대 `limit`건씩 기여하므로 SureChEMBL이 KIPRIS를 밀어내지 않는다(라이브 검증: 아스피린 → surechembl 20 + kipris 30 = 특허 50건, total_hits 707,590).
- 상태 분류는 ok/empty/rate_limited/timeout/error로 둔다.
