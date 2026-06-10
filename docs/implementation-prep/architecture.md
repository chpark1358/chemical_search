# 이상형 월드컵 MVP 기술 아키텍처

작성일: 2026-05-20  
기준 문서:
- `docs/ideal-worldcup-prd.md`
- `docs/mvp-ia-wireframes.md`

## 1. 아키텍처 목표

MVP의 목표는 커뮤니티 기능을 넓히기보다 플레이 루프, 비회원 제작, 결과 공유, 신고 처리를 안정적으로 검증하는 것이다. 첫 구현에서는 데이터 무결성, 멱등 처리, 모바일 체감 성능, 운영자가 위험 콘텐츠를 처리할 수 있는 최소 도구를 우선한다.

핵심 기준:
- 홈/상세에서 플레이 시작까지 3클릭 이내
- 모바일 16강 플레이 완주 가능
- 새로고침 후 같은 브라우저 세션 복구
- 후보 이미지 실패에도 선택 진행 가능
- 신고 콘텐츠를 관리자 화면에서 처리 가능
- 결과 공유 이미지가 모바일 메신저에서 깨지지 않음

## 2. 추천 스택

| 영역 | 권장 |
|---|---|
| 앱 | Next.js App Router + TypeScript |
| UI | React, Tailwind CSS 또는 CSS Modules |
| 폼 검증 | React Hook Form + Zod |
| API | Next.js Route Handlers |
| DB | PostgreSQL |
| ORM | Prisma 또는 Drizzle |
| 미디어 | S3 호환 Object Storage + CDN |
| 비동기 작업 | Redis/BullMQ 또는 호스팅 플랫폼 queue |
| 인증 | MVP는 비회원 중심, 관리자만 세션 기반 인증 |
| 관측 | 구조화 로그, 이벤트 테이블, 오류 추적 |

Next.js를 권장하는 이유는 공개 상세/카테고리 페이지의 SEO와 플레이/생성 UI의 인터랙션을 한 코드베이스에서 빠르게 처리할 수 있기 때문이다. PostgreSQL은 월드컵, 후보, 세션, 매치 이벤트, 신고를 트랜잭션으로 다루기 좋다.

## 3. 권장 폴더 구조

```text
app/
  (public)/
    page.tsx
    explore/page.tsx
    category/[slug]/page.tsx
    worldcup/[slug]/page.tsx
    worldcup/[slug]/play/page.tsx
    worldcup/[slug]/result/[sessionId]/page.tsx
    worldcup/new/page.tsx
    worldcup/[slug]/edit/page.tsx
  admin/
    reports/page.tsx
    worldcups/[id]/page.tsx
  api/
    worldcups/
    play-sessions/
    reports/
    media/
    admin/
components/
  common/
  worldcup/
  play/
  create/
  admin/
domains/
  worldcup/
  tournament/
  play-session/
  ranking/
  moderation/
  media/
  analytics/
lib/
  db/
  auth/
  validation/
  storage/
  jobs/
  rate-limit/
  errors/
```

UI 컴포넌트는 `components/*`, 토너먼트 생성/통계/신고 같은 규칙은 `domains/*`에 둔다. API 핸들러는 인증, 요청 검증, 응답 매핑만 담당하고 핵심 규칙은 도메인 서비스에 위임한다.

## 4. 핵심 도메인 모델

| 모델 | 목적 | 주요 필드 |
|---|---|---|
| `users` | 관리자와 향후 회원 확장 | id, email, role, status |
| `anonymous_identities` | 비회원 플레이/생성 추적 | id, cookie_key, ip_hash, user_agent_hash |
| `worldcups` | 월드컵 공개 단위 | id, slug, title, description, category_id, status, visibility, edit_password_hash, candidate_count |
| `candidates` | 후보 항목 | id, worldcup_id, name, description, media_asset_id, active, order |
| `media_assets` | 업로드/외부 URL 미디어 | id, source_type, original_url, storage_url, thumbnail_url, status, mime_type |
| `play_sessions` | 한 번의 플레이 시도 | id, worldcup_id, anonymous_id, selected_round, seed, status, winner_candidate_id |
| `session_snapshots` | 새로고침 복구 상태 | session_id, bracket_state_json, current_round, current_match_index |
| `match_events` | 실제 선택 이벤트 | id, session_id, match_id, winner_candidate_id, loser_candidate_id, elapsed_ms, client_sequence |
| `candidate_stats` | 후보 누적 통계 | candidate_id, exposure_count, selection_count, match_wins, match_losses, finals, final_wins |
| `reports` | 신고 접수 | id, target_type, target_id, reason, detail, status |
| `moderation_actions` | 관리자 처리 감사 로그 | id, admin_id, target_type, target_id, action, memo |
| `analytics_events` | 퍼널 이벤트 | id, event_name, anonymous_id, worldcup_id, session_id, payload_json |

상태 값:
- `worldcups.status`: `draft`, `published`, `private`, `hidden_by_report`, `deleted`
- `play_sessions.status`: `active`, `completed`, `abandoned`, `expired`
- `reports.status`: `pending`, `reviewing`, `resolved_keep`, `resolved_hidden`, `resolved_deleted`, `rejected`
- `media_assets.status`: `pending`, `ready`, `failed`, `blocked`, `deleted`

## 5. API 초안

### 공개 탐색

| Method | Path | 목적 |
|---|---|---|
| GET | `/api/worldcups` | 홈/탐색 목록 조회 |
| GET | `/api/worldcups/:slug` | 상세 조회 |
| GET | `/api/worldcups/:slug/candidates` | 후보 미리보기 조회 |
| GET | `/api/worldcups/:slug/rankings` | 랭킹 조회 |
| GET | `/api/categories` | 카테고리 조회 |

목록 파라미터: `q`, `category`, `sort`, `period`, `mediaType`, `cursor`, `limit`

### 플레이

| Method | Path | 목적 |
|---|---|---|
| POST | `/api/worldcups/:slug/play-sessions` | 라운드 선택 후 세션 생성 |
| GET | `/api/play-sessions/:sessionId` | 세션/현재 매치 복구 |
| POST | `/api/play-sessions/:sessionId/select` | 후보 선택 기록 |
| POST | `/api/play-sessions/:sessionId/exit` | 중도 이탈 기록 |
| GET | `/api/play-sessions/:sessionId/result` | 결과 조회 |

선택 API는 멱등성을 가져야 한다. 같은 `sessionId + matchId + clientSequence`가 다시 들어오면 기존 결과를 반환하고 통계를 중복 반영하지 않는다.

### 만들기/수정

| Method | Path | 목적 |
|---|---|---|
| POST | `/api/worldcups` | 월드컵 생성 |
| PATCH | `/api/worldcups/:id` | 기본 정보 수정 |
| POST | `/api/worldcups/:id/edit-auth` | 비회원 수정 비밀번호 확인 |
| POST | `/api/worldcups/:id/candidates` | 후보 추가 |
| PATCH | `/api/candidates/:id` | 후보 수정 |
| DELETE | `/api/candidates/:id` | 후보 비활성화 |
| POST | `/api/worldcups/:id/publish` | 검증 후 발행 |
| POST | `/api/media/upload` | 이미지 업로드 URL 발급 또는 직접 업로드 |

발행 검증:
- 제목, 카테고리 필수
- 활성 후보 4명 이상
- 모든 활성 후보가 후보명과 표시 가능한 미디어를 보유
- 비회원 월드컵은 수정 비밀번호 해시 보유
- 금칙어/스크립트/민감 플래그 검증

### 공유/이벤트/신고

| Method | Path | 목적 |
|---|---|---|
| POST | `/api/share/result-image` | 결과 공유 이미지 생성 |
| POST | `/api/events` | 클라이언트 이벤트 수집 |
| POST | `/api/reports` | 신고 접수 |
| GET | `/api/admin/reports` | 신고 큐 조회 |
| GET | `/api/admin/worldcups/:id` | 콘텐츠 검토 상세 |
| POST | `/api/admin/reports/:id/actions` | 신고 처리 |
| POST | `/api/admin/worldcups/:id/moderation` | 월드컵 상태 변경 |

## 6. 토너먼트 알고리즘

### 라운드 계산

1. 활성 후보 수를 조회한다.
2. 후보 수 이하의 2의 거듭제곱 라운드를 계산한다.
3. 제작자가 지정한 `min_round`, `max_round` 범위가 있으면 필터링한다.
4. P0 기본 정책은 랜덤 샘플링이다.

### 기본 모드: 랜덤 샘플링

1. 세션 생성 시 서버에서 `seed`를 만든다.
2. 활성 후보를 안정 정렬한 뒤 seed 기반 shuffle을 적용한다.
3. `selected_round` 개수만큼 앞에서 샘플링한다.
4. 2명씩 묶어 첫 라운드 매치를 생성한다.
5. bracket은 `session_snapshots.bracket_state_json`에 저장한다.

이 방식은 후보가 46명이고 32강을 선택하면 정확히 32명만 노출되어 통계 기준이 명확하다.

### 전체 후보 모드

전체 후보 노출 요구가 강할 때만 설정 옵션으로 둔다. 후보 수보다 큰 bracket size를 만들고 부족한 자리는 bye로 채운다. bye는 `match_wins`나 `selection_count`에 반영하지 않는다.

## 7. 매치 처리 흐름

1. 서버가 현재 match와 요청 `matchId`를 비교한다.
2. 이미 처리된 match면 기존 snapshot과 다음 match를 반환한다.
3. 유효한 선택이면 `match_events`에 insert한다.
4. winner를 현재 match에 저장하고 loser를 탈락 목록에 추가한다.
5. 라운드가 끝나면 winners로 다음 라운드 match를 생성한다.
6. 최종 winner가 나오면 `play_sessions.status=completed`와 `winner_candidate_id`를 저장한다.
7. 같은 트랜잭션에서 핵심 통계를 반영하거나 append-only 이벤트를 queue로 넘긴다.

## 8. 미디어 처리

- P0는 이미지/GIF 중심으로 제한한다.
- MIME allowlist, 용량/해상도 제한, EXIF 제거를 적용한다.
- 외부 URL은 서버가 fetch 전 SSRF 방어를 수행하고 storage로 복사한다.
- 후보 이미지는 thumbnail/card/result 용도로 리사이즈한다.
- 이미지 실패 시 후보명 기반 fallback 카드로 플레이가 계속 가능해야 한다.

## 9. 보안/운영 고려사항

- 모든 사용자 입력은 서버에서 Zod 등으로 검증한다.
- 제목, 설명, 후보명, 신고 상세는 escape 처리한다.
- 비회원 수정 비밀번호는 bcrypt 또는 Argon2로 해시 저장한다.
- 관리자 API에는 인증, 권한, CSRF 방어, audit log가 필요하다.
- 신고, 생성, 업로드, 선택 API에는 rate limit을 둔다.
- 외부 URL 수집에는 private IP 차단, redirect 제한, MIME 검증이 필요하다.
- 민감/성인/저작권 위험 콘텐츠는 기본 검색 노출에서 제외할 수 있어야 한다.

## 10. 구현 순서

1. DB schema와 migration
2. worldcup/candidate 생성, 조회, 발행 API
3. seed 기반 bracket 생성
4. play session 생성, 선택, snapshot 복구 API
5. 결과/랭킹 집계
6. 홈/탐색 projection
7. 공유 이미지 생성
8. 신고 접수와 관리자 처리
9. 이벤트 로깅과 운영 대시보드 기초

## 11. 구현 전 결정 사항

| 항목 | 권장안 |
|---|---|
| 관리자 인증 | 내부 운영자 세션 기반 인증 |
| 공유 이미지 | 서버 렌더링 우선, 클라이언트 미리보기 보조 |
| 전체 후보 모드 | P0 기본 비활성, 제작자 설정으로만 허용 |
| 영상 후보 | P0는 썸네일 표시 중심, 재생은 제한 |
| 통계 조작 방어 | anonymous_id + IP hash + 세션 반복 패턴으로 최소 보정 |
