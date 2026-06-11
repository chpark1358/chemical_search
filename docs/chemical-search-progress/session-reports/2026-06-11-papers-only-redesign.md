# 작업 종료 보고서: 논문 전용(papers-only) 피벗과 재설계

날짜: 2026-06-11
상태: 완료
관련 단계: MVP-1

## 목적

제품 스코프를 화학물질 기반 논문 검색(papers-only)으로 축소하고, 저장소 구성과 문서/계약을 새 스코프 기준으로 재정렬한다.

## 완료한 작업

- 피벗 결정 3건 확정 및 기록
  - D-010: 논문 전용 축소 — ChEMBL 구조 검색과 특허 검색(SureChEMBL, EPO OPS, Google Patents) 범위 제외
  - D-011: Linear 스타일 UI 재설계 — getdesign.md linear.app DESIGN.md 기반, `/chemical`에서 루트 라우트 `/`로 이동
  - D-012: 월드컵 앱 저장소에서 제거 — 커밋 `9cd47e2`, git 히스토리로 복원 가능
- Phase 1-2 작업을 베이스라인 커밋 `1c45ee5`로 스냅샷 (`.gitattributes` LF 정규화 포함)
- papers-only API 계약 정의: 상태값 `needs_candidate_selection | running | done | partial | failed` (`partial_failed` → `partial` 개명), ChEMBL/threshold 파라미터 제거, snake_case JSON 유지
- 루트 `README.md` 신규 작성 (Node/Python 양쪽 셋업, 실행/테스트 명령, 환경 변수 표)
- `.env.example`에서 월드컵용 변수(`DATABASE_URL`, `STORAGE_*`, `ADMIN_SESSION_SECRET`) 제거
- `AGENTS.md`에 프로젝트 개요, 구조, 검증 명령, 작업 종료 시 문서 갱신 의무 추가
- 진행 문서 갱신: current-status/phase-status를 새 스코프 기준으로 재작성, decision-log에 D-010~D-012 추가, open-issues에서 O-002/O-003 종결과 O-010/O-011 신규 등록, progress-log에 기록 정정(초기 커밋 `13a31c5` → 실제 `b2963ad`) 추가
- 기획 문서(`docs/chemical-structure-patent-literature-search-plan.md`)에 스코프 변경 공지 추가

## 변경 파일

- `README.md` (신규)
- `.env.example`
- `AGENTS.md`
- `docs/chemical-search-progress/README.md`
- `docs/chemical-search-progress/current-status.md`
- `docs/chemical-search-progress/phase-status.md`
- `docs/chemical-search-progress/progress-log.md`
- `docs/chemical-search-progress/decision-log.md`
- `docs/chemical-search-progress/open-issues.md`
- `docs/chemical-search-progress/session-reports/2026-06-11-papers-only-redesign.md` (신규)
- `docs/chemical-structure-patent-literature-search-plan.md`

## 구현/진행 방식

코드 재작업(백엔드 스키마 변경, 루트 UI 재구축)과 문서 정비를 분리해서 진행했다. 이 보고서는 피벗 결정과 문서 정비를 다루고, 백엔드/프론트 재작업 개요는 다음과 같다.

- 백엔드: FastAPI 엔드포인트 경로는 유지하고 record 스키마만 papers-only로 변경한다. candidate 선택 시 `candidate_id`로 record의 후보 객체를 찾아 파이프라인에 전달한다 (재조회/리스트 인덱스 사용 금지). `done`은 1개 이상 provider가 논문을 반환하고 hard error가 없는 경우, `partial`은 일부 provider 오류, `failed`는 사용 가능한 결과가 없는 경우다.
- 프론트: 루트 라우트 `/`에 Linear 스타일 다크 테마(캔버스 `#010102`, 라벤더 `#5e6ad2`, Inter + JetBrains Mono)로 새 화면을 구현하고 `src/lib/api.ts`를 계약 기준으로 삼는다.
- 문서: 구 스코프 기록은 삭제하지 않고 ~~취소선~~과 `범위 제외 (D-010)` 표시로 이력을 보존했다.

## 검증 결과

- 백엔드: `unittest` 76개 전부 통과 (provider 픽스처 파싱, 상태 도출, dedup, TTL/축출, 오류 새니타이즈 포함).
- 프론트: `npm run lint` 0건, `tsc --noEmit` 0건, `next build` 성공, Playwright 스모크 3/3 통과 (직접 검색·후보 선택·실패 흐름, page.route 모킹).
- UI 스크린샷으로 Linear 스타일 적용 확인 (canvas #010102, lavender #5e6ad2 단일 액센트, hairline 보더, 모노 메타데이터).
- 적대적 리뷰 워크플로(3개 차원 + 검증)에서 확정 high 1건(pubchem 진단 칩 오표시)과 경미 16건 발견 → 가치 있는 15건 수정 완료 후 전 검증 재통과.
- 커밋 확인: `git log`에서 `b2963ad`(문서 기준 커밋), `1c45ee5`(베이스라인), `9cd47e2`(월드컵 제거) 존재 확인.
- `httpx2` 미사용 확인: `requirements-poc.txt`에 고정되어 있으나 `scripts/`, `tests/`에서 import 없음 (O-011 등록).

## 남은 이슈

- Semantic Scholar 무인증 429 (O-007)
- FastAPI 무인증 노출 — 로컬 전제, 배포 시 보호 필요 (O-010)
- `httpx2` 미사용 의존성 제거 (O-011, 백엔드 작업 소관)
- 검색 상태 인메모리 저장 한계 (O-009)

## 다음 작업

1. 실제 외부 API(PubChem/Semantic Scholar/Crossref) 대상 수동 통합 검증 (FastAPI + Next 동시 구동)
2. Semantic Scholar API key 발급 결정 (O-007)
3. 배포 전 FastAPI 보호 계층 결정 (O-010)
