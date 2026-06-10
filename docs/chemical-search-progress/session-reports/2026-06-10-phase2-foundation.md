# 작업 종료 보고서: Phase 2 계획 재정렬 및 기반 구현

날짜: 2026-06-10
상태: 완료
관련 단계: Phase 2 MVP-1

## 목적

Phase 1 구현 결과와 기존 계획을 대조해 개발 순서를 수정하고, 웹 UI 전에 provider 안정성과 결과/API 계약을 고정한다.

## 계획 수정

기존의 웹 UI 우선 순서를 다음과 같이 변경했다.

1. 실행 환경과 provider 안정화
2. 결과 병합, ranking, evidence 계약
3. FastAPI 검색 및 후보 선택 API
4. Next.js 웹 UI와 Ketcher
5. durable search state와 background job

SureChEMBL과 EPO OPS는 MVP-2 항목이므로 Phase 2 진행을 막지 않는다.

## 완료한 작업

- project Python 3.11 venv 설치 스크립트
- 직접 의존성 버전 고정
- hashed success-response file cache
- 429/5xx/timeout retry와 backoff
- host 단위 요청 간격 제어
- Crossref `mailto` 지원
- InChIKey/DOI 기반 중복 제거
- deterministic ranking과 evidence 병합
- CSV export
- 10개 normalization quality fixture
- FastAPI normalize/search/candidate selection/result/export API

## 검증 결과

```powershell
& scripts\chemical_search\setup-poc.ps1
.venv-chemical\Scripts\python.exe -m scripts.chemical_search.evaluate_quality
.venv-chemical\Scripts\python.exe -m uvicorn scripts.chemical_search.api:app --port 8100
```

- project venv 단위/API 계약 테스트 12개 통과
- quality fixture 10/10 통과
- 동일 검색 두 번째 실행 cache hit 확인
- PubChem/ChEMBL aspirin 결과가 하나의 ranked result로 병합됨
- FastAPI `/health`, `/api/chem/normalize` 실제 서버 smoke test 통과

## 남은 이슈

- 검색 상태가 인메모리라 서버 재시작과 다중 worker를 지원하지 않는다.
- Semantic Scholar는 API key 없을 때 HTTP 429가 반복된다.
- provider 동시 요청 제어는 아직 없다.
- Next.js 화면은 기존 월드컵 코드와 분리해서 구현해야 한다.

## 다음 작업

1. Chemical Search 전용 Next.js 화면과 FastAPI client
2. candidate selection 및 ranked result/evidence UI
3. Ketcher 구조 입력
4. PostgreSQL/Redis 기반 durable 상태
