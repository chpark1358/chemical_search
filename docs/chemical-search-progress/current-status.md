# 현재 개발 상태

최종 업데이트: 2026-06-11

## 한 줄 요약

2026-06-11부로 제품 스코프가 화학물질 기반 논문 검색(papers-only)으로 축소됐고(D-010), 월드컵 앱 제거(D-012)와 루트 라우트 Linear 스타일 UI 재설계(D-011)를 포함한 백엔드/프론트 재작업이 진행 중이다.

## 스코프 변경 (2026-06-11)

### 제거됨

- ChEMBL 구조 검색 전체: exact/similarity/substructure provider, 검색 모드/threshold 파라미터
- 특허 검색 범위 전체: SureChEMBL, EPO OPS, Google Patents 외부 검색 링크
- ideal-worldcup Next.js 앱: 커밋 `9cd47e2`에서 제거, git 히스토리로 복원 가능
- `/chemical` 분리 라우트: 루트 라우트 `/`로 대체 진행 중
- 검색 상태값 `partial_failed`: `partial`로 개명 진행 중

### 유지됨

- 입력 감지(name/SMILES/InChI/InChIKey/formula)와 RDKit 구조 정규화
- PubChem 후보 resolver와 candidate selection 흐름
- Semantic Scholar/Crossref 논문 adapter
- provider cache/retry/throttle과 partial result 처리
- FastAPI normalize/search/candidate selection/result/export 엔드포인트 (record 스키마는 papers-only로 변경 중)
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

## 현재 단계

- 단계: Phase 2 MVP-1 (papers-only 재설계)
- 상태: 진행 중
- 진행률: 재산정 중 (이전 85%는 ChEMBL/특허 포함 구 스코프 기준)

## 현재 주요 결과

- `rdkit_normalize`: ok
- `pubchem_name_lookup`: ok
- `pubchem_formula_lookup`: ok
- `crossref_search`: ok
- `semantic_scholar_search`: partial, HTTP 429로 API key 필요 가능성
- `provider_cache`: ok, 동일 검색의 두 번째 요청이 cache hit로 처리됨
- `quality_fixture`: ok, 정규화 10/10 통과
- papers-only 재설계(백엔드 스키마 변경, 루트 UI)의 검증 결과는 아직 없음 — 재작업 완료 후 기록한다
- 구 스코프 결과(`chembl_*`, `surechembl_*`, `epo_ops_*`, `/chemical` UI 검증)는 범위 제외로 추적을 중단한다

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
4. Semantic Scholar API key 발급 결정 (O-007)
5. 검색 상태 영속 저장소(PostgreSQL/Redis) 설계 (O-009)
