# 구현 진행 로그

## 2026-05-20

### P0-S0. 프로젝트 scaffold와 실행 환경

목표:
- Next.js App Router 기반 프로젝트를 루트에 구성한다.
- MVP 핵심 화면의 초기 라우트 골격을 만든다.
- 이후 진행 단계와 구조 변경을 문서로 남기는 규칙을 설정한다.

수행:
- `package.json`, Next.js/TypeScript/Tailwind/ESLint 설정 파일을 추가했다.
- `src/app` 기반 라우트 구조를 만들었다.
- 홈, 탐색, 상세, 플레이, 결과, 만들기, 관리자 신고 큐의 초기 화면을 추가했다.
- `src/domains/worldcup`, `src/domains/tournament`에 mock 데이터와 라운드 계산 유틸을 추가했다.
- `docs/project-management`에 진행 기록 규칙과 로그 파일을 추가했다.

검증:
- `npm install` 완료.
- `npm run build` 1차 성공. 단, Next.js workspace root 경고가 있어 `next.config.ts`에 `turbopack.root`를 명시했다.
- `npm run lint` 1차 성공. 단, ESLint 설정 파일의 anonymous default export 경고가 있어 설정 변수를 분리했다.
- `npm run build` 재실행 성공.
- `npm run lint` 재실행 성공, 경고 없음.
- `npm audit --omit=dev`에서 Next.js 내부 `postcss <8.5.10` moderate advisory 2건 확인. 자동 수정은 `next@9.3.3`로 내려가는 breaking change를 제안하므로 적용하지 않았다.
- 개발 서버를 `http://127.0.0.1:3000`에서 실행했다.
- Playwright CLI로 홈 데스크톱, 상세 모바일, 플레이 모바일 스크린샷을 생성했다.
- 스크린샷 검토 중 전역 `a { color: inherit; }`가 링크형 CTA의 `text-white`를 덮어쓰는 문제를 발견해 `a:not([class])`로 범위를 줄였다.
- CTA 색상 수정 후 `npm run build` 성공.
- CTA 색상 수정 후 `npm run lint` 성공.
- Playwright로 `output/home-desktop-after.png`, `output/detail-mobile-after.png`, `output/play-mobile-after.png`를 다시 생성했고 버튼 텍스트 가독성을 확인했다.

다음 작업:
- P0-S1 단계로 넘어가 DB schema와 도메인 API 계약을 구현한다.
- Next.js 안정 버전에서 해당 advisory가 해소되는지 추적한다.

### P0-S1. 도메인 API 계약과 mock 저장소

목표:
- DB 연결 전에도 핵심 API 계약을 실제 route handler로 검증한다.
- 월드컵 조회, 후보/랭킹 조회, 플레이 세션 생성, 매치 선택의 최소 흐름을 구현한다.
- 토너먼트 bracket 생성과 멱등 선택 처리를 도메인 함수로 분리한다.

수행:
- `src/lib/api/responses.ts`에 공통 성공/오류 응답 헬퍼를 추가했다.
- `src/domains/worldcup/schemas.ts`와 `src/domains/play-session/schemas.ts`에 Zod 기반 요청 검증 스키마를 추가했다.
- `src/domains/play-session/types.ts`에 세션/bracket/match 타입을 추가했다.
- `src/domains/tournament/bracket.ts`에 seed 기반 shuffle, bracket 생성, 현재 매치 조회, 선택 처리 로직을 추가했다.
- `src/domains/worldcup/store.ts`에 mock 월드컵 저장소와 in-memory 플레이 세션 저장소를 추가했다.
- 다음 API route를 추가했다.
  - `GET /api/worldcups`
  - `GET /api/worldcups/:slug`
  - `GET /api/worldcups/:slug/candidates`
  - `GET /api/worldcups/:slug/rankings`
  - `POST /api/worldcups/:slug/play-sessions`
  - `GET /api/play-sessions/:sessionId`
  - `POST /api/play-sessions/:sessionId/select`
  - `GET /api/play-sessions/:sessionId/result`

검증:
- `npm run build` 성공.
- `npm run lint` 성공.
- dev 서버에서 `POST /api/worldcups/street-food/play-sessions`로 4강 세션 생성 성공.
- `POST /api/play-sessions/:sessionId/select`로 첫 매치 선택 후 다음 매치로 이동 성공.
- Node fetch로 API 응답 한글이 UTF-8로 정상 출력되는 것을 확인했다.

다음 작업:
- P0-S2에서 플레이 화면을 실제 API와 연결한다.
- 선택 후 다음 매치 전환, 세션 복구, 결과 화면 이동을 클라이언트 상태로 구현한다.

### P0-S2. 플레이 UI와 API 연결

목표:
- 플레이 화면에서 세션 생성 API를 호출하고 실제 매치 선택 API로 다음 라운드를 진행한다.
- 후보 선택부터 결과 화면 이동까지 MVP 핵심 루프를 브라우저에서 검증한다.
- 반복 검증 가능한 Playwright 스모크 테스트를 추가한다.

수행:
- `src/components/play/PlayExperience.tsx`를 추가해 플레이 세션 생성, 선택 제출, 진행률 계산, 결과 화면 이동을 클라이언트에서 처리하게 했다.
- `src/components/play/CandidateChoice.tsx`에 선택 콜백과 비활성 상태를 연결했다.
- `/worldcup/[slug]/play` 페이지가 정적 mock 선택 대신 `PlayExperience`를 사용하도록 변경했다.
- Next.js dev route 번들 경계에서도 플레이 세션이 유지되도록 `src/domains/worldcup/store.ts`의 mock 저장소를 `globalThis` 기반 싱글턴으로 변경했다.
- `@playwright/test`와 `playwright.config.ts`, `tests/smoke/play-flow.spec.ts`를 추가해 모바일 플레이 핵심 루프를 테스트하게 했다.

검증:
- `npm run test:smoke` 1차 실패: 세션 생성 route와 선택 route 사이에서 in-memory 세션을 찾지 못하는 문제를 발견했다.
- mock 저장소를 전역 싱글턴으로 수정한 뒤 `npm run test:smoke` 재실행 성공.
- `npm run build` 성공.
- `npm run lint` 성공.
- 개발 서버는 `http://127.0.0.1:3000`에서 확인 가능하다.

다음 작업:
- 결과 화면을 mock winner가 아니라 `GET /api/play-sessions/:sessionId/result` 응답과 연결한다.
- 새로고침/뒤로가기 시 세션 복구 UX를 보강한다.
- 상세 페이지의 라운드 선택 값이 실제 플레이 시작 요청에 반영되도록 연결한다.
