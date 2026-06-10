# Chemical Search 실행 계획

최종 업데이트: 2026-06-10

## 계획 점검 결론

Phase 1 POC 이후 바로 웹 UI를 구현하는 기존 순서는 수정한다. 현재 provider 호출과 결과 계약이 안정화되지 않은 상태에서 API/UI를 먼저 만들면 cache, retry, 중복 제거, ranking을 추가할 때 응답 계약과 화면을 다시 수정해야 한다.

Phase 0의 미완료 항목 중 SureChEMBL과 EPO OPS는 MVP-2 범위이므로 Phase 2 시작을 막지 않는다. Ketcher 검증은 웹 UI 작업 직전에 수행한다. OPSIN은 name 입력의 best-effort 확장으로 유지한다.

## 수정된 구현 순서

### Step 1. 실행 환경과 provider 안정화

- [x] Python POC requirements 작성
- [x] provider 공통 결과와 diagnostics 계약
- [x] provider 실패 시 partial result 유지
- [x] 성공 응답 file cache
- [x] 429/5xx/timeout retry와 backoff
- [x] provider host 단위 요청 간격 제어
- [x] Crossref `mailto` 설정 지원
- [x] project Python 3.11 venv 설치 스크립트와 직접 의존성 버전 고정

### Step 2. 결과 계약 고정

- [x] compound 중복 제거: InChIKey 우선
- [x] paper 중복 제거: DOI 우선
- [x] match evidence 구조화
- [x] deterministic ranking 구현
- [x] CSV export
- [x] 검색 품질 fixture와 평가 명령

### Step 3. 검색 API와 후보 선택 상태

- [x] Python 검색 서비스 인터페이스 고정
- [x] normalize API
- [x] search 생성 API
- [x] formula/name candidate selection API
- [x] provider diagnostics 응답
- [x] API contract test

### Step 4. 웹 UI와 Ketcher

- [x] 기존 월드컵 UI와 분리된 Chemical Search 화면 구조
- [x] name/formula/SMILES 검색 UI
- [x] candidate selection UI
- [x] 결과와 evidence/partial 상태 표시
- [ ] Ketcher 구조 입력 검증 및 통합
- [x] Markdown/CSV export UI

### Step 5. MVP-2 사전 검증

- [ ] SureChEMBL go/no-go 결정
- [ ] EPO OPS credentials/quota 결정
- [ ] 특허 결과 계약
- [ ] evidence-locked summary 설계 검증

## 운영 원칙

- 외부 provider 장애는 전체 검색 실패로 전파하지 않는다.
- raw cache에는 요청 URL이나 API key를 기록하지 않는다.
- 민감 검색에서는 cache를 비활성화할 수 있어야 한다.
- API/UI 구현 전에 결과 병합과 ranking 계약을 테스트로 고정한다.
- 각 단계 종료 시 진행 문서와 Graphify를 업데이트한다.
