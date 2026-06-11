# 현재 개발 상태

최종 업데이트: 2026-06-11

## 한 줄 요약

2026-06-11부로 제품 스코프가 화학물질 기반 논문 검색(papers-only)으로 축소됐고(D-010), 월드컵 앱 제거(D-012)와 루트 라우트 Linear 스타일 UI 재설계(D-011)를 포함한 백엔드/프론트 재작업이 진행 중이다. 같은 날 특허 검색이 SureChEMBL로 재도입돼(D-014) 결과 유형이 논문(Semantic Scholar/Crossref/OpenAlex 3소스)과 특허(SureChEMBL)로 분리됐다. 이어 한글 물질명 입력을 Wikidata로 해석하는 기능(D-015, 키 불필요)과 한국 특허 검색을 위한 KIPRIS 특허 source(D-016, `KIPRIS_SERVICE_KEY` 키 게이트)를 추가했다.

## 스코프 변경 (2026-06-11)

### 제거됨

- ChEMBL 구조 검색 전체: exact/similarity/substructure provider, 검색 모드/threshold 파라미터
- EPO OPS 특허 메타데이터 보강: 범위 제외 유지(O-003)
- Google Patents 통합 검색 링크(D-009): 특허별 SureChEMBL 딥링크로 대체(D-014)
- ideal-worldcup Next.js 앱: 커밋 `9cd47e2`에서 제거, git 히스토리로 복원 가능
- `/chemical` 분리 라우트: 루트 라우트 `/`로 대체 진행 중
- 검색 상태값 `partial_failed`: `partial`로 개명 진행 중

참고: 특허 검색은 한 차례 전면 제외됐다가(D-010) 2026-06-11 SureChEMBL provider로 재도입됐다(D-014). EPO OPS/ChEMBL 구조검색은 계속 제외한다.

### 유지됨

- 입력 감지(name/SMILES/InChI/InChIKey/formula)와 RDKit 구조 정규화
- 한글 물질명 입력: 2026-06-11 추가(D-015). 질의에 한글이 포함되고 입력 유형이 auto/name이면 PubChem 이름 조회 이전에 Wikidata로 한글명→PubChem CID/InChIKey를 해석하고, 미매칭 시 PubChem 이름 조회로 폴백. API key 불필요. 브랜드/통용명 일부는 미매칭(O-013)
- PubChem 후보 resolver와 candidate selection 흐름
- 논문 adapter: Semantic Scholar/Crossref에 2026-06-11 OpenAlex 추가(D-013). 유효 논문 소스는 `semantic_scholar | crossref | openalex` 3개이며 Semantic Scholar는 무인증 best-effort로 유지
- 특허 source: SureChEMBL(`surechembl`) 2026-06-11 재도입(D-014). 논문과 분리된 결과 유형으로 표시하며 API key 불필요. 같은 날 한국 특허 source `kipris` 추가(D-016): `KIPRIS_SERVICE_KEY`가 설정된 경우에만 동작하는 키워드 기반 검색이며, 미설정 시 비활성(키 없을 때 기본 source 미포함). 특허 탭에 SureChEMBL/KIPRIS가 함께 표시된다. `sources` 미지정 시 기본값은 논문 3소스 + `surechembl`(+ 키 있을 때 `kipris`)
- provider cache/retry/throttle과 partial result 처리
- FastAPI normalize/search/candidate selection/result/export 엔드포인트 (record 스키마는 papers-only 기준에 `patents[]`/`patents_total_hits` 추가 중)
- CSV/Markdown/JSON export

## 완료된 작업 (새 스코프 기준)

- GitHub 저장소 `https://github.com/chpark1358/chemical_search.git` 초기 커밋 및 `main` 푸시
- 개발 진행 기록용 Markdown 문서 체계 생성
- Phase 0 API spike: RDKit normalize, PubChem name/formula lookup, Crossref 검증 통과
- Phase 1 CLI POC: 입력 감지, RDKit 정규화, PubChem resolver, Semantic Scholar/Crossref adapter, partial result 유지
- 프로젝트 전용 Python 3.11 venv와 직접 의존성 버전 고정
- provider 성공 응답 hashed file cache, 429/5xx/timeout retry, host 단위 throttle
- DOI 기반 논문 병합과 deterministic ranking
- CSV export와 10개 정규화 품질 fixture
- FastAPI normalize/search/candidate selection/result/export API (구 스키마 기준)
- 2026-06-11: Phase 1-2 작업 베이스라인 커밋 `1c45ee5` 생성 (`.gitattributes` LF 정규화 포함)
- 2026-06-11: 월드컵 앱 제거 커밋 `9cd47e2` 생성
- 2026-06-11: papers-only 피벗 결정 기록 (D-010, D-011, D-012)
- 2026-06-11: README/.env.example/AGENTS.md/진행 문서를 새 스코프 기준으로 정비
- 2026-06-11: OpenAlex 논문 소스 추가 결정 기록 (D-013)과 O-007 완화, 문서를 3개 논문 소스 기준으로 갱신

## 현재 단계

- 단계: Phase 2 MVP-1 (papers-only 재설계)
- 상태: 진행 중
- 진행률: 재산정 중 (이전 85%는 ChEMBL/특허 포함 구 스코프 기준)

## 현재 주요 결과

- `rdkit_normalize`: ok
- `pubchem_name_lookup`: ok
- `pubchem_formula_lookup`: ok
- `crossref_search`: ok
- `semantic_scholar_search`: partial, 무인증 HTTP 429. key 신규 발급이 사실상 중단되어 best-effort로 유지 (O-007 완화, D-013)
- `openalex_search`: 미검증 — provider 구현 후 결과를 기록한다
- `surechembl`: 2026-06-11 라이브 재검증으로 HTTPS/화합물→특허 매핑 정상 확인(D-014, O-002). provider 구현 후 상세 결과를 기록한다
- `wikidata_name_lookup`: 한글 물질명 해석(D-015). SPARQL 라이브 검증으로 아스피린→CID 2244 / BSYNRYMUTXBXSQ-UHFFFAOYSA-N, 카페인→2519, 이부프로펜→3672, 아세트아미노펜→1983 확인. 타이레놀·포도당 등 브랜드/통용명 일부 미매칭(O-013). API key 불필요
- `kipris`: 한국 특허 검색(D-016). `KIPRIS_SERVICE_KEY` 키 게이트로, 현재 키 미발급으로 비활성(O-012). 키 발급 후 fixture/라이브 검증 결과를 기록한다
- `provider_cache`: ok, 동일 검색의 두 번째 요청이 cache hit로 처리됨
- `quality_fixture`: ok, 정규화 10/10 통과
- papers-only 재설계와 SureChEMBL 특허 재도입(백엔드 스키마 변경, 루트 UI)의 검증 결과는 아직 없음 — 재작업 완료 후 기록한다
- 구 스코프 결과(`chembl_*`, `epo_ops_*`, `/chemical` UI 검증)는 범위 제외로 추적을 중단한다

## 현재 주요 산출물

- `scripts/chemical_search/` Python 파이프라인: `normalize.py`, `providers.py`, `pipeline.py`, `cache.py`, `http_client.py`, `results.py`, `api.py` (papers-only 계약으로 변경 중)
- `tests/test_chemical_search_*.py` 단위/계약 테스트
- `src/app/` Next.js UI (루트 라우트 Linear 스타일로 재구축 중, `src/lib/api.ts` 기준)
- `next.config.ts` `/chemical-api` rewrite
- `README.md`, `.env.example`, `AGENTS.md` (2026-06-11 새 스코프 기준 정비)
- `docs/chemical-search-progress/` 진행 문서 일체
- `docs/chemical-search-progress/session-reports/2026-06-11-papers-only-redesign.md`

## 다음 작업 후보

1. FastAPI papers-only 계약 구현/검증 (`partial_failed` → `partial`, ChEMBL/threshold 파라미터 제거)
2. 루트 라우트 Linear 스타일 UI 구현 및 브라우저 검증
3. `httpx2` 미사용 의존성 제거 (O-011)
4. OpenAlex provider 구현/검증과 병합 우선순위 `semantic_scholar > openalex > crossref` 반영 (D-013, O-007 완화)
5. 검색 상태 영속 저장소(PostgreSQL/Redis) 설계 (O-009)
