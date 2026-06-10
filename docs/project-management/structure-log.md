# 구조 변경 로그

## 2026-05-20

### P0-S0 scaffold

추가:
- `package.json`: Next.js 앱 실행 스크립트와 의존성 정의
- `next.config.ts`: Next.js 설정
- `tsconfig.json`: TypeScript strict 설정과 `@/*` alias
- `postcss.config.mjs`: Tailwind CSS 4 PostCSS 설정
- `eslint.config.mjs`: Next.js ESLint 설정
- `.env.example`: 개발 환경 변수 예시
- `src/app`: App Router 라우트
- `src/components`: 공통/월드컵/플레이 UI 컴포넌트
- `src/domains`: 월드컵 도메인 타입, mock 데이터, 토너먼트 유틸
- `src/lib`: 라우트 헬퍼
- `docs/project-management`: 진행/구조 변경 기록 문서
- `package-lock.json`: 설치된 npm 의존성 lockfile
- `output/home-desktop-after.png`, `output/detail-mobile-after.png`, `output/play-mobile-after.png`: scaffold 화면 검증 스크린샷

수정:
- `next.config.ts`: 상위 사용자 폴더의 lockfile로 인한 Next.js workspace root 경고를 막기 위해 `turbopack.root`를 현재 프로젝트 루트로 지정
- `eslint.config.mjs`: lint 경고 제거를 위해 기본 export 전 설정 변수 분리
- `src/app/globals.css`: 전역 링크 색상 규칙이 CTA 색상을 덮어쓰지 않도록 클래스 없는 링크에만 적용

주요 라우트:
- `/`
- `/explore`
- `/worldcup/[slug]`
- `/worldcup/[slug]/play`
- `/worldcup/[slug]/result/[sessionId]`
- `/worldcup/new`
- `/admin/reports`

영향:
- 기존 `docs/`의 PRD, IA, 구현 준비 문서는 유지했다.
- 실제 앱 소스는 `src/` 아래로 분리했다.

### P0-S1 도메인 API 계약

추가:
- `src/lib/api/responses.ts`: API 성공/오류 응답 헬퍼
- `src/domains/worldcup/schemas.ts`: 월드컵 목록/생성 요청 검증 스키마
- `src/domains/play-session/schemas.ts`: 플레이 세션 생성/매치 선택 요청 검증 스키마
- `src/domains/play-session/types.ts`: 플레이 세션, bracket, match 타입
- `src/domains/tournament/bracket.ts`: seed 기반 bracket 생성과 선택 처리 도메인 로직
- `src/domains/worldcup/store.ts`: mock 월드컵 저장소와 in-memory 플레이 세션 저장소
- `src/app/api/worldcups/*`: 월드컵 목록/상세/후보/랭킹/세션 생성 API
- `src/app/api/play-sessions/*`: 세션 조회/선택/결과 API

영향:
- 아직 DB는 연결하지 않았다.
- API 계약과 플레이 세션 흐름을 실제 route handler로 먼저 고정했다.
- 다음 단계에서 플레이 UI가 이 API를 호출하도록 연결할 수 있다.

### P0-S2 플레이 UI 연결과 스모크 테스트

추가:
- `src/components/play/PlayExperience.tsx`: 세션 생성, 매치 선택, 진행률, 결과 이동을 담당하는 클라이언트 컴포넌트
- `playwright.config.ts`: 로컬 dev 서버 재사용/자동 실행이 가능한 Playwright 설정
- `tests/smoke/play-flow.spec.ts`: 모바일 뷰포트에서 `street-food` 월드컵을 끝까지 진행하는 스모크 테스트

수정:
- `package.json`: `test:smoke` 스크립트와 `@playwright/test` dev dependency 추가
- `package-lock.json`: Playwright 테스트 의존성 lockfile 반영
- `src/app/worldcup/[slug]/play/page.tsx`: 플레이 UI를 `PlayExperience` 기반으로 교체
- `src/components/play/CandidateChoice.tsx`: 후보 선택 이벤트와 disabled 상태 지원
- `src/domains/worldcup/mock-data.ts`: mock 후보 수 확장을 지원해 16강 이상 테스트 가능하게 변경
- `src/domains/worldcup/store.ts`: route handler 사이에서 세션 Map이 분리되지 않도록 mock store를 `globalThis` 싱글턴으로 변경

영향:
- MVP 핵심 루프인 `세션 생성 -> 후보 선택 -> 다음 매치 -> 결과 이동`이 실제 API 호출 기반으로 동작한다.
- 현재 결과 화면은 아직 mock winner를 보여주며, 다음 단계에서 세션 결과 API와 연결해야 한다.
