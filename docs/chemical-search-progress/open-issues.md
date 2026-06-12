# 오픈 이슈

최종 업데이트: 2026-06-12

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

상태: 해결 (2계층 인증, D-017, 2026-06-12)

현재 결과:

- 2계층 인증을 도입해 해결했다(D-017).
  1. **프론트 게이트:** `src/middleware.ts`가 모든 요청을 전역 게이트한다. 비로그인 사용자는 앱 경로에서 `/login`으로 리다이렉트되고, `/chemical-api/*` 프록시는 401 JSON을 돌려준다(백엔드 프록시도 로그인 세션을 요구).
  2. **사용자별 데이터:** 저장됨/검색 기록은 Supabase에 사용자별로 저장되며 RLS로 격리된다(`supabase/schema.sql`).
  3. **백엔드 보호:** 백엔드 FastAPI는 private Hugging Face Space로 배포되고, 런타임 프록시 라우트가 서버 측 `CHEMICAL_API_TOKEN`을 `Authorization: Bearer`로 주입해 private Space를 인증 호출한다(브라우저에는 토큰 비노출).

잔여 리스크:

- **서버 측 rate limit이 강제되지 않는다.** 로그인한 사용자가 반복 검색하면 외부 API 한도(KIPRIS Plus, Semantic Scholar 등)를 소진할 수 있다. 운영 확장 시 프록시/백엔드에 사용자·IP 단위 레이트리밋을 추가한다.
- Google Patents는 비공식 XHR provider라 ToS 회색지대·DC IP 차단 리스크가 있다(D-018, O-014).
- 입력 크기 제한의 서버 측 강제는 미적용.

영향:

외부 배포(Vercel + private HF Space)에서 인증/접근 제어가 갖춰졌다. 레이트리밋 강제만 후속 과제로 남는다.

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

상태: 해결 (키 설정 완료, 2026-06-11 라이브 검증)

현재 결과:

- 한국 특허 검색(KIPRIS)은 환경 변수 `KIPRIS_SERVICE_KEY`(KIPRIS Plus AccessKey)가 설정된 경우에만 동작한다(D-016).
- 2026-06-11 KIPRIS Plus AccessKey를 설정하고 라이브로 검증했다. `freeSearchInfo` 응답이 `resultCode == "00"`로 정상 반환되며 한국 특허가 조회됐다. 키가 설정돼 KIPRIS는 현재 활성 상태이고, 특허 탭에 SureChEMBL과 함께 한국 특허가 표시된다.
- AccessKey는 plus.kipris.or.kr 가입 후 'API KEY 관리'에서 발급받은 KIPRIS Plus "REST AccessKey"다(data.go.kr 활용신청이 아니다). 발급된 키를 `KIPRIS_SERVICE_KEY`에 넣으면 KIPRIS 특허가 특허 탭에 SureChEMBL과 함께 표시된다.
- 새로 발급한 KIPRIS Plus 키는 활성화까지 시간이 걸릴 수 있다.

확인 필요:

- 운영 환경에서 KIPRIS Plus 호출 한도 내 throttle 적정성
- `TotalSearchCount`가 큰 키워드의 페이지네이션/표시 범위

영향:

키가 설정돼 한국 특허가 정상 조회된다. 키가 없으면 한국 특허 결과만 비어 있고 나머지 검색(논문, SureChEMBL 특허)은 정상 동작한다.

### O-014: Google Patents 비공식 XHR 의존

상태: 인지 (한계 수용, D-018)

현재 결과:

- Google Patents 특허 검색은 공개 API/계약 없는 비공식 XHR 엔드포인트(`patents.google.com/xhr/query`)에 의존한다(D-018). 브라우저 User-Agent를 요구하며(없으면 403), Google이 데이터센터 IP(예: 호스팅된 HF Space)를 차단할 수 있다. ToS 회색지대다.
- 차단/파싱 실패는 graceful error 진단으로 처리되고 특허 탭은 SureChEMBL/KIPRIS로 계속 채워진다.

확인 필요:

- 운영 환경(HF Space IP)에서 Google Patents 차단 빈도 모니터링
- 차단이 잦으면 SureChEMBL/KIPRIS 보조 의존도 조정 또는 공식 데이터셋(BigQuery) 검토

영향:

관련도 랭킹 특허 결과의 가용성이 Google의 비공식 엔드포인트 정책/IP 차단에 종속된다. 다만 특허 탭 자체는 다른 소스로 유지된다.

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
