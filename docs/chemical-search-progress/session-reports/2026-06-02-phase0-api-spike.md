# 작업 종료 보고서: Phase 0 API spike 1차 구현 및 실행

날짜: 2026-06-02
상태: 완료
관련 단계: Phase 0 기술 검증

## 목적

화학 구조 기반 특허/논문 검색 서비스의 POC 개발 전에 핵심 provider와 RDKit 정규화가 현재 환경에서 실제로 동작하는지 검증한다.

## 완료한 작업

- Phase 0 API spike 스크립트 작성
- requirements 파일 작성
- RDKit 미설치 상태 확인
- RDKit 설치
- PubChem name/formula lookup 실행
- ChEMBL similarity/substructure query 실행
- Semantic Scholar search 실행 및 429 확인
- Crossref bibliographic search 실행
- SureChEMBL root discovery 실행 및 TLS 오류 확인
- EPO OPS credentials 미설정 상태 확인
- JSON/Markdown 결과 리포트 생성

## 변경 파일

- `scripts/chemical_search/phase0_api_spike.py`
- `scripts/chemical_search/requirements-phase0.txt`
- `output/chemical-search/phase0_api_spike.md`
- `output/chemical-search/phase0_api_spike.json`
- `docs/chemical-search-progress/current-status.md`
- `docs/chemical-search-progress/phase-status.md`
- `docs/chemical-search-progress/progress-log.md`
- `docs/chemical-search-progress/decision-log.md`
- `docs/chemical-search-progress/open-issues.md`
- `docs/chemical-search-progress/session-reports/2026-06-02-phase0-api-spike.md`

## 구현/진행 방식

Python 단일 스크립트로 provider check를 분리했다. 각 check는 `ok`, `partial`, `skipped`, `error` 중 하나를 반환하고, 결과는 JSON과 Markdown으로 저장한다. 외부 provider 실패는 개발 실패가 아니라 go/no-go 판단 대상이므로 기본 실행은 exit code 0으로 유지하고, 필요 시 `--strict`로 엄격 검증할 수 있게 했다.

## 검증 결과

실행 명령:

```powershell
py -m pip install --user rdkit==2026.3.2
$env:PYTHONUTF8='1'; py scripts\chemical_search\phase0_api_spike.py --out output\chemical-search
$env:PYTHONUTF8='1'; py -m py_compile scripts\chemical_search\phase0_api_spike.py
```

최종 provider 결과:

| Check | Status | 의미 |
|---|---|---|
| rdkit_normalize | ok | aspirin SMILES parse/normalize 성공 |
| pubchem_name_lookup | ok | aspirin name lookup 성공 |
| pubchem_formula_lookup | ok | `C9H8O4` 후보 1244건 반환 |
| chembl_similarity | ok | threshold 80 similarity 5건 반환 |
| chembl_substructure | ok | substructure 5건 반환 |
| semantic_scholar_search | partial | HTTP 429, API key 또는 retry 필요 |
| crossref_search | ok | bibliographic query 5건 반환 |
| surechembl_discovery | error | TLS certificate verification failure |
| epo_ops_credentials | skipped | credentials 미설정 |

## 남은 이슈

- SureChEMBL TLS/endpoint 문제를 조사해야 한다.
- Semantic Scholar API key 필요 여부를 결정해야 한다.
- EPO OPS credentials를 발급받을지 결정해야 한다.
- RDKit 설치 방식을 POC 이후 재현 가능한 환경으로 고정해야 한다.

## 다음 작업

1. SureChEMBL API endpoint와 TLS 문제 조사
2. Semantic Scholar API key 또는 Crossref-only fallback 결정
3. EPO OPS credentials 필요 여부 결정
4. Phase 1 POC 코드 구조 설계