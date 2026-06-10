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
