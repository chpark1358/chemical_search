# 현재 개발 상태

최종 업데이트: 2026-06-02

## 한 줄 요약

Phase 0 API spike 1차 구현과 실행이 완료됐다. RDKit, PubChem, ChEMBL, Crossref는 사용 가능성이 확인됐고, Semantic Scholar는 API key 필요 가능성, SureChEMBL은 TLS 인증서 문제가 확인됐다.

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

## 현재 단계

- 단계: Phase 0 기술 검증
- 상태: 진행 중
- 진행률: 약 45%

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

## 현재 주요 산출물

- `scripts/chemical_search/phase0_api_spike.py`
- `scripts/chemical_search/requirements-phase0.txt`
- `output/chemical-search/phase0_api_spike.md`
- `output/chemical-search/phase0_api_spike.json`
- `docs/chemical-search-progress/session-reports/2026-06-02-phase0-api-spike.md`

## 다음 작업 후보

1. SureChEMBL endpoint/TLS 문제 조사
2. Semantic Scholar API key 설정 또는 fallback 전략 확정
3. EPO OPS credentials 확보 여부 결정
4. POC용 normalize/search API 구조 설계
5. Phase 1 POC 프로젝트 구조 생성
