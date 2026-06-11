# 오픈 이슈

최종 업데이트: 2026-06-11

## 높은 우선순위

### O-001: RDKit 실행 환경 결정

상태: 해결

현재 결과:

- Windows Python 3.11 사용자 환경에 `rdkit==2026.3.2` 설치 완료
- aspirin SMILES normalize 성공
- 프로젝트 전용 `.venv-chemical` 설치 스크립트 추가
- Python 3.11과 직접 의존성 `requests==2.34.2`, `rdkit==2026.3.3` 고정

영향:

로컬 POC와 테스트는 project venv를 사용한다. 배포 환경은 웹 API 단계에서 별도로 결정한다.

### O-002: SureChEMBL API 안정성 검증

상태: 해결 / 재개 (특허 검색 재도입, D-014)

현재 결과:

- 과거 `https://www.api.surechembl.org/` 호출 시 TLS certificate verification failure가 발생했고, 2026-06-11 papers-only 피벗(D-010)으로 한 차례 추적을 종료했다.
- 2026-06-11 SureChEMBL을 라이브로 재검증한 결과 `https://www.surechembl.org/api`가 HTTPS로 정상 접근되며 TLS 문제가 재현되지 않는다. `/api/v3/api-docs`로 OpenAPI가 문서화돼 있고, API key 없이 화합물→특허 매핑과 특허별 Google Patents 딥링크를 얻을 수 있다.
- D-014로 특허 검색을 SureChEMBL provider로 재도입한다(논문과 분리 표시). 새 API base는 `https://www.surechembl.org/api`이며, 이전 `www.api.surechembl.org` 호스트는 사용하지 않는다.

확인 필요:

- 운영 환경에서 화합물→특허 2단계 호출(resolve → documents)의 throttle/retry 적정성
- `total_hits`가 큰 화합물의 페이지네이션/표시 범위

영향:

특허 검색이 다시 활성 범위에 들어왔다. SureChEMBL 가용성이 특허 결과 가용성에 직접 영향을 준다(논문 결과는 영향받지 않음).

### O-003: EPO OPS 인증과 quota 확인

상태: 종결 (범위 제외 유지, D-010·D-014)

현재 결과:

- `EPO_OPS_CONSUMER_KEY`, `EPO_OPS_CONSUMER_SECRET` 미설정으로 skipped 상태였다.
- 2026-06-11 특허 검색이 SureChEMBL로 재도입됐지만(D-014), 재도입 범위는 SureChEMBL provider만이다. EPO OPS는 여전히 범위에서 제외한다.

영향:

EPO OPS 기반 특허 메타데이터 보강을 다시 범위에 넣는 경우에만 재오픈한다.

### O-007: Semantic Scholar API key 필요 여부

상태: 완화 (OpenAlex 추가, D-013)

현재 결과:

- 인증 없는 요청에서 HTTP 429 발생
- Semantic Scholar가 무료 도메인 이메일과 서드파티 앱의 API key 신규 발급을 중단해(2024-09 공식 X 공지, 2025년까지 승인 정체) key 발급은 사실상 불가능하다.
- 2026-06-11 OpenAlex를 주력 논문 소스로 추가해(D-013) Semantic Scholar 의존도를 낮췄다. Semantic Scholar는 무인증 best-effort로 유지한다.

확인 필요:

- best-effort 호출의 retry/backoff 정책 적정성
- Semantic Scholar key 발급 정책 변경 여부 (재개 시 재검토)

영향:

OpenAlex+Crossref가 주력 소스이므로 Semantic Scholar 429가 검색 가용성을 막지 않는다. Semantic Scholar 결과는 응답이 가능할 때만 병합 품질을 보강한다.

### O-008: 공개 provider rate limit과 재시도 정책

상태: 부분 해결

현재 결과:

- Semantic Scholar는 인증 없는 요청에서 HTTP 429가 반복된다.
- Crossref는 Phase 0 재실행 중 일시적으로 HTTP 429를 반환했지만 후속 POC 요청은 성공했다.
- provider 실패를 partial 결과로 보존한다.
- 성공 응답 file cache, 429/5xx/timeout retry, host 단위 요청 간격을 구현했다.
- Crossref `mailto` 설정을 지원한다.
- papers-only 피벗 후 대상 provider는 PubChem/Semantic Scholar/Crossref/OpenAlex 4개다 (ChEMBL 제외, OpenAlex는 D-013으로 추가).

확인 필요:

- 동시 요청 제한
- 운영 환경에서 적절한 요청 간격과 retry 횟수 조정
- cache 삭제/보존 정책

영향:

반복 검색 시 결과 안정성에 영향이 있다.

### O-009: 검색 상태 저장소와 background job

상태: 미해결

현재 결과:

- FastAPI candidate selection/search 상태 계약을 구현했다.
- 검색 상태는 프로세스 메모리에 저장된다.
- FastAPI `BackgroundTasks`로 검색을 실행한다.
- papers-only 재설계에서 상태값이 `needs_candidate_selection | running | done | partial | failed`로 변경된다 (`partial_failed` → `partial`).

확인 필요:

- PostgreSQL search/candidate/result schema 적용
- Redis/RQ 또는 다른 durable job queue 도입 시점
- 서버 재시작과 다중 worker 환경의 상태 일관성
- 검색 결과 보존 기간과 민감 query 삭제 정책

영향:

현재 구조는 로컬 MVP 개발에는 충분하지만 서버 재시작 또는 다중 worker 운영에는 사용할 수 없다.

## 중간 우선순위

### O-004: OPSIN 도입 여부

상태: 미해결

확인 필요:

- IUPAC name 처리 정확도
- 설치/운영 방식
- 라이선스

영향:

IUPAC 입력을 MVP-1에 넣을지 best-effort로 둘지 결정한다.

### O-005: 민감 R&D query 저장 정책

상태: 미해결

확인 필요:

- private mode 기본값
- 검색 로그 보존 기간
- 외부 AI 전송 허용 여부
- raw external response 저장 여부

영향:

보안/프라이버시 설계와 데이터 모델에 영향이 있다.

### O-010: FastAPI 무인증 노출

상태: 미해결

현재 결과:

- FastAPI는 인증 없이 모든 엔드포인트를 노출하며 `127.0.0.1:8000` 로컬 실행을 전제로 한다.
- Next.js rewrite(`/chemical-api`)도 접근 제어 없이 그대로 프록시한다.

확인 필요:

- 배포 시 인증/접근 제어 방식 (API key, reverse proxy, 네트워크 격리 등)
- rate limit과 입력 크기 제한의 서버 측 강제

영향:

로컬 개발에는 문제가 없지만, 외부 배포 전에 반드시 보호 계층을 추가해야 한다.

## 낮은 우선순위

### O-006: PDF/image OCR 도입 시점

상태: 보류

현재 판단:

OSRA/DECIMER 기반 구조 이미지 인식은 MVP 범위에서 제외한다.

### O-011: `httpx2` 미사용 의존성

상태: 미해결

현재 결과:

- `scripts/chemical_search/requirements-poc.txt`에 `httpx2==2.3.0`이 고정되어 있으나 코드에서 import하지 않는다.

확인 필요:

- papers-only 재설계(백엔드 작업)에서 제거

영향:

설치 시간과 의존성 표면이 불필요하게 늘어난다. 기능 영향은 없다.

### O-012: KIPRIS_SERVICE_KEY 미발급 시 한국 특허 비활성

상태: 대기 (사용자 키 발급 필요)

현재 결과:

- 한국 특허 검색(KIPRIS)은 환경 변수 `KIPRIS_SERVICE_KEY`가 설정된 경우에만 동작한다(D-016).
- 현재 키가 없어 KIPRIS 소스는 비활성 상태다(오류 아님). `providers[]`/`patents[]`에서 제외되고, 키가 없으면 기본 source에도 포함되지 않는다.
- data.go.kr '특허실용신안 정보 검색 서비스' 활용신청으로 개발단계 키가 자동 승인되며, 발급된 일반 인증키를 `KIPRIS_SERVICE_KEY`에 넣으면 KIPRIS 특허가 특허 탭에 SureChEMBL과 함께 표시된다.

확인 필요:

- 사용자 키 발급 후 라이브 검증(단어 검색 응답, totalCount, 상태 분류)
- 개발단계 약 월 1,000회 호출 한도 내 throttle 적정성

영향:

키가 없으면 한국 특허 결과만 비어 있고 나머지 검색(논문, SureChEMBL 특허)은 정상 동작한다.

### O-013: Wikidata 한글명 커버리지 한계

상태: 인지 (한계 수용)

현재 결과:

- 한글 물질명 입력은 Wikidata로 해석한다(D-015). 아스피린·카페인·이부프로펜·아세트아미노펜 등은 라이브 검증으로 매칭됐다.
- 브랜드명·통용명 일부(예: 타이레놀, 포도당)는 Wikidata에 PubChem CID 매핑이 없어 미매칭된다. 이 경우 기존 PubChem 이름 조회로 폴백하며, 대개 실패해 기존 "찾을 수 없음" 안내로 이어진다.

확인 필요:

- 미매칭 빈도와 사용자 영향 모니터링
- 필요 시 동의어/별칭 보강 또는 추가 해석 소스 검토

영향:

핵심 물질명은 한글로 검색되지만, 상표/통용명 일부는 영문명·SMILES 등 다른 입력으로 우회해야 한다.
