# 현재 개발 상태

최종 업데이트: 2026-06-10

## 한 줄 요약

Phase 2 MVP-1이 진행 중이다. provider 안정화와 FastAPI 검색 계약 위에 월드컵 UI와 분리된 Chemical Search 웹 화면, 후보 선택, 결과/evidence/diagnostics, export 흐름까지 구현됐다.

## 완료된 작업

- GitHub 저장소 `https://github.com/chpark1358/chemical_search.git` 초기 커밋 및 `main` 푸시
- 화학 구조 기반 특허/논문 검색 서비스 기획 문서 작성
- MVP 범위 재검토 및 `POC -> MVP-1 -> MVP-2 -> Professional` 단계 분리
- Provider Adapter 계약 초안 정의
- 후보 선택 API 흐름 정의
- AI evidence-locked summary 원칙 정의
- 검색 품질 평가 기준 추가
- 보안/프라이버시/컴플라이언스 원칙 추가
- 개발 진행 기록용 Markdown 문서 체계 생성
- Phase 0 API spike 스크립트 작성
- RDKit Python 패키지 설치 및 aspirin SMILES normalize 검증
- PubChem name/formula lookup 검증
- ChEMBL similarity/substructure query 검증
- Crossref bibliographic query 검증
- Phase 1 CLI POC 모듈 구조 생성
- SMILES/name/formula 입력 감지와 RDKit 구조 정규화 구현
- PubChem candidate resolver 구현
- ChEMBL exact/similarity/substructure adapter 구현
- Semantic Scholar/Crossref paper adapter 구현
- provider 장애 시 partial result 유지 구현
- JSON/Markdown 결과와 source URL/match reason 출력 구현
- 네트워크 없이 실행되는 POC 단위 테스트 추가
- 프로젝트 전용 Python 3.11 venv와 직접 의존성 버전 고정
- provider 성공 응답 hashed file cache 구현
- 429/5xx/timeout retry와 host 단위 throttle 구현
- InChIKey/DOI 기반 결과 병합과 deterministic ranking 구현
- 결과별 구조화 evidence와 provider diagnostics 구현
- CSV export와 10개 정규화 품질 fixture 구현
- FastAPI normalize/search/candidate selection/result/export API 구현
- `/chemical` 전용 Next.js 검색 작업공간 구현
- 동일 출처 `/chemical-api` rewrite 기반 FastAPI client 구현
- name/formula/SMILES 검색 조건과 provider 선택 UI 구현
- formula 후보 선택, polling, ranked result/evidence/partial diagnostics UI 구현
- JSON/Markdown/CSV export UI 구현
- 정규화 화합물 기준 Google Patents 외부 검색 링크 구현
- 출처별 권장 용도·신뢰도와 현재 자료 처리 흐름을 설명하는 사용자 안내 UI 구현

## 현재 단계

- 단계: Phase 2 MVP-1
- 상태: 진행 중
- 진행률: 약 85%

## 현재 주요 결과

- `rdkit_normalize`: ok
- `pubchem_name_lookup`: ok
- `pubchem_formula_lookup`: ok
- `chembl_similarity`: ok
- `chembl_substructure`: ok
- `crossref_search`: ok
- `semantic_scholar_search`: partial, HTTP 429로 API key 필요 가능성
- `surechembl_discovery`: error, TLS certificate verification failure
- `epo_ops_credentials`: skipped, credentials 미설정
- `phase1_name_search`: ok, aspirin 조회 성공
- `phase1_formula_search`: ok, `C9H8O4` 후보 선택 후 조회 성공
- `phase1_smiles_search`: ok, aspirin SMILES 조회 성공
- `phase1_invalid_smiles`: partial, 오류를 결과에 표시하고 정상 종료
- `provider_cache`: ok, 동일 검색의 두 번째 요청이 cache hit로 처리됨
- `result_merge`: ok, PubChem/ChEMBL aspirin 결과가 InChIKey 기준으로 병합됨
- `quality_fixture`: ok, 정규화 10/10 통과
- `fastapi_contract`: ok, normalize와 candidate selection 상태/API export 테스트 통과
- `next_chemical_ui`: ok, lint/build 통과 및 `/chemical` route 생성 확인
- `browser_name_search`: ok, aspirin 실제 검색에서 normalized compound와 21개 병합 결과 표시
- `browser_formula_selection`: ok, `C9H8O4` 후보 목록에서 Aspirin 선택 후 결과 표시
- `browser_console`: ok, 경고/오류 없음

## 현재 주요 산출물

- `scripts/chemical_search/phase0_api_spike.py`
- `scripts/chemical_search/requirements-phase0.txt`
- `output/chemical-search/phase0_api_spike.md`
- `output/chemical-search/phase0_api_spike.json`
- `docs/chemical-search-progress/session-reports/2026-06-02-phase0-api-spike.md`
- `scripts/chemical_search/poc_cli.py`
- `scripts/chemical_search/pipeline.py`
- `scripts/chemical_search/providers.py`
- `scripts/chemical_search/normalize.py`
- `tests/test_chemical_search_poc.py`
- `docs/chemical-search-progress/session-reports/2026-06-10-phase1-poc.md`
- `scripts/chemical_search/cache.py`
- `scripts/chemical_search/results.py`
- `scripts/chemical_search/evaluate_quality.py`
- `scripts/chemical_search/api.py`
- `docs/chemical-search-progress/execution-plan.md`
- `docs/chemical-search-progress/session-reports/2026-06-10-phase2-foundation.md`
- `src/app/chemical/`
- `src/components/chemical/ChemicalSearchWorkspace.tsx`
- `src/lib/chemical-api.ts`
- `docs/chemical-search-progress/session-reports/2026-06-10-phase2-web-ui.md`

## 다음 작업 후보

1. Ketcher 구조 입력 검증 및 통합
2. Google Patents Public Datasets BigQuery provider 타당성 검증
3. 검색 상태 저장소를 PostgreSQL/Redis 기반으로 교체
4. Chemical Search 브라우저 회귀 테스트 자동화
5. SureChEMBL/EPO OPS MVP-2 go/no-go 결정
