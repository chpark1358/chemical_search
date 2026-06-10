# 이상형 월드컵 MVP 프론트엔드 구현 계획

기준 문서:
- `docs/ideal-worldcup-prd.md`
- `docs/mvp-ia-wireframes.md`

## 1. 구현 원칙

- 모바일 우선으로 설계하고 390px 모바일, 1440px 데스크톱에서 모두 검증한다.
- 첫 화면은 실제 사용 흐름을 바로 시작하는 화면이어야 하며 랜딩 페이지식 설명을 만들지 않는다.
- 플레이 화면은 선택 반응성과 진행 복구 안정성을 최우선으로 둔다.
- 플레이 화면과 라운드 선택 흐름에는 광고나 방해 요소를 넣지 않는다.
- 모든 주요 흐름은 로딩, 빈 상태, 오류, 이미지 실패, 중복 입력 방지 상태를 포함한다.

## 2. 라우트 구조

| 경로 | 화면 | 목적 |
|---|---|---|
| `/` | 홈 | 인기/최신 월드컵 탐색, 검색, 만들기 진입 |
| `/explore` | 탐색/검색 | 검색어, 카테고리, 정렬, 기간 필터 기반 목록 |
| `/category/:slug` | 카테고리 | 카테고리별 월드컵 목록 |
| `/worldcup/:slug` | 상세 | 시작 전 정보 확인, 라운드 선택, 후보/랭킹 미리보기 |
| `/worldcup/:slug/play` | 플레이 | 1:1 후보 선택 |
| `/worldcup/:slug/result/:sessionId` | 결과 | 우승자, 선택 경로, 공유 |
| `/worldcup/new` | 만들기 | 비회원 월드컵 생성 |
| `/worldcup/:slug/edit` | 수정 인증/수정 | 비밀번호 기반 수정 |
| `/admin/reports` | 신고 큐 | 신고 목록 검토 |
| `/admin/worldcups/:id` | 콘텐츠 검토 | 신고 대상 상세 및 처리 |

## 3. 화면별 컴포넌트

### S01 홈 `/`

```text
HomePage
  AppHeader
    LogoLink
    SearchBar
    CreateButton
    MobileMenuButton
  HomeContent
    FeaturedSection
      WorldCupCardGrid
    CategoryChipList
    LatestSection
      WorldCupCardGrid
  AppFooter
```

작업:
- 검색 제출 시 `/explore?q=...`로 이동한다.
- 인기/최신 섹션은 각각 skeleton, 빈 상태, 오류 상태를 가진다.
- 카드 클릭은 상세로 이동하고, 카드 내 시작 CTA는 상세 또는 기본 라운드 시작으로 이어진다.

### S02 탐색 `/explore`

```text
ExplorePage
  AppHeader
  SearchControls
    SearchBar
    CategoryTabs
    SortSelect
    PeriodFilter
    MediaTypeFilter
  ResultSummary
  WorldCupCardGrid
  LoadMoreButton
```

작업:
- 검색어, 필터, 정렬, 페이지 cursor를 URL query와 동기화한다.
- 필터 변경 시 기존 결과를 유지하면서 상단 loading indicator를 보여준다.
- 결과 없음 상태에는 검색어 수정 CTA와 인기 콘텐츠 추천을 둔다.

### S03 카테고리 `/category/:slug`

```text
CategoryPage
  AppHeader
  CategoryHeader
  SubcategoryChipList
  SortSelect
  WorldCupCardGrid
```

작업:
- 카테고리 설명, 하위 태그, 인기/최신/완주율순 정렬을 제공한다.
- 민감/비공개/삭제 콘텐츠는 기본 목록에서 제외한다.

### S04 상세 `/worldcup/:slug`

```text
WorldCupDetailPage
  AppHeader
  DetailHero
    CoverCandidatePair
    WorldCupMeta
    RoundSelectControl
    StartButton
    ShareButton
    ReportButton
  CandidatePreviewSection
  RankingSummarySection
  RelatedWorldCupSection
  StickyStartBar
```

작업:
- 첫 viewport에 제목, 후보 수, 라운드 선택, 시작 CTA가 반드시 보인다.
- 모바일에서는 `StickyStartBar`로 라운드 선택과 시작 버튼을 하단 고정한다.
- 후보 4명 미만, 비공개, 삭제, 신고 제한 상태는 시작 버튼을 비활성화하고 이유를 표시한다.

### S05 라운드 선택

```text
RoundSelector
  RoundOptionList
  EstimatedDuration
  SamplingPolicyNote
  StartButton
```

작업:
- 가능한 라운드만 활성화한다.
- 후보 수보다 큰 라운드는 비활성화하고 이유를 tooltip 또는 보조 텍스트로 제공한다.
- 전체 후보 모드가 활성화된 경우 bye 안내를 제공한다.

### S06 플레이 `/worldcup/:slug/play`

```text
PlayPage
  PlaySessionGuard
  PlayHeader
    ExitButton
    WorldCupTitle
    RoundProgressLabel
    ProgressBar
  MatchStage
    MatchOptionCard(left)
    VersusBadge
    MatchOptionCard(right)
  PlayAssistPanel
    KeyboardHint
    MatchQueue
    EliminatedList
  ExitConfirmDialog
  RestoreSessionNotice
```

작업:
- 좌우 후보 카드 전체가 선택 영역이다.
- 선택 후 `transitioning` 동안 클릭, 키보드, 터치를 잠근다.
- `ArrowLeft`, `ArrowRight`, `Esc`를 지원한다.
- 이미지 실패 시 후보명 기반 fallback 카드가 같은 크기로 표시된다.
- 새로고침 후 서버 snapshot 복구를 먼저 시도하고 실패 시 재시작 안내를 보여준다.

### S07 결과 `/worldcup/:slug/result/:sessionId`

```text
ResultPage
  AppHeader
  ResultHero
    WinnerMedia
    WinnerName
    RankingComparison
  ShareActions
  ReplayActions
  SelectionPath
  RelatedWorldCupSection
```

작업:
- 우승자 이미지와 이름을 첫 화면 중심에 배치한다.
- 링크 복사, 공유 이미지 저장, 다시하기, 다른 라운드 선택을 제공한다.
- 공유 버튼 클릭은 `share_click`, 이미지 저장은 `share_image_download`로 기록한다.

### S08 만들기 `/worldcup/new`

```text
CreateWorldCupPage
  AppHeader
  CreateStepper
  StepPanel
    BasicInfoForm
    CandidateEditor
    PublishPreview
  UnsavedChangesGuard
```

작업:
- 1단계: 제목, 설명, 카테고리, 공개 여부, 민감 콘텐츠 여부, 수정 비밀번호
- 2단계: 후보명, 후보 설명, 이미지 업로드 또는 미디어 URL
- 3단계: 검증 요약, 상세 미리보기, 샘플 매치, 가능한 라운드, 발행
- 후보 4명 미만, 비밀번호 불일치, 업로드 실패, 중복 후보명은 분리된 오류로 표시한다.

### S09 신고/관리자

```text
ReportDialog
  ReportTargetSummary
  ReportReasonRadioGroup
  ReportDetailTextarea
  SubmitReportButton
```

```text
AdminReportsPage
  AdminHeader
  ReportFilterBar
  ReportTable
```

```text
AdminWorldCupReviewPage
  ContentReviewPanel
  CandidateReviewList
  ReportHistory
  ModerationActionBar
  ModerationMemoField
```

작업:
- 신고 target type은 `worldcup`, `candidate`, `result`를 지원한다.
- 관리자 처리는 유지, 비공개, 삭제, 반려를 명확히 분리한다.
- 처리 완료 후 목록으로 돌아가기와 다음 신고 보기 액션을 제공한다.

## 4. 공통 컴포넌트

| 컴포넌트 | 사용 화면 | 구현 메모 |
|---|---|---|
| `AppHeader` | 전체 공개 화면 | 데스크톱 검색창, 모바일 검색 아이콘/메뉴 분기 |
| `SearchBar` | 홈, 탐색, 헤더 | 제출 시 URL query 반영 |
| `WorldCupCard` | 홈, 탐색, 추천 | 대표 이미지 2장, 제목 2줄, 후보 수, 플레이 수 |
| `CandidateMedia` | 상세, 플레이, 결과 | 이미지/GIF fallback, 고정 aspect-ratio |
| `RoundSelector` | 상세, 결과 재시작 | 후보 수 기반 라운드 계산 |
| `BottomSheet` | 모바일 라운드 선택/보조 패널 | focus trap, 닫기 제스처 |
| `ConfirmDialog` | 종료/삭제 | 키보드 focus 복귀 |
| `Toast` | 링크 복사/발행/신고 성공 | 짧은 상태 피드백 |
| `LoadingSkeleton` | 목록/상세/결과 | 레이아웃 이동 최소화 |
| `EmptyState` | 목록/검색/관리자 | 다음 행동 CTA 포함 |
| `ErrorState` | 공통 오류 | 재시도/이동 CTA 포함 |

## 5. 상태 모델

```text
ExploreQueryState
  q: string
  category: string | null
  sort: "popular" | "latest" | "completionRate"
  period: "all" | "today" | "week" | "month"
  mediaType: "all" | "image" | "gif" | "video" | "text"
  pageCursor: string | null
```

```text
WorldCupStartState
  selectedRound: number
  availableRounds: number[]
  isRoundSheetOpen: boolean
  canStart: boolean
  disabledReason: string | null
```

```text
PlaySessionState
  sessionId: string
  status: "initializing" | "playing" | "transitioning" | "restoring" | "completed" | "failed"
  currentRoundLabel: string
  currentMatchIndex: number
  totalMatchCount: number
  currentMatch: { leftCandidateId: string; rightCandidateId: string }
  bracketState: object
  inputLocked: boolean
  restoreSource: "server" | "local" | null
```

```text
CreateWorldCupState
  step: "basic" | "candidates" | "preview"
  basicInfo: object
  candidates: CandidateDraft[]
  validation: { fieldErrors: object; blockingErrors: string[]; warnings: string[] }
  publishStatus: "idle" | "submitting" | "success" | "failed"
```

## 6. 모바일/접근성 기준

- 터치 대상은 최소 44px 이상.
- 후보 카드 제목은 최대 2줄, 넘치면 말줄임 처리.
- 버튼/카드/입력은 키보드 focus가 보여야 한다.
- 플레이 후보 카드는 접근 가능한 이름에 후보명, 좌/우 위치, 선택 안내를 포함한다.
- 모달/하단 시트는 focus trap, Esc 닫기, 닫힌 뒤 trigger focus 복귀를 지원한다.
- 색상만으로 선택/오류/비활성 상태를 구분하지 않는다.

## 7. 이벤트 로깅 연결

| 이벤트 | 발생 지점 |
|---|---|
| `worldcup_view` | 상세 진입 완료 |
| `search_submit` | 검색 제출 |
| `category_click` | 카테고리 선택 |
| `card_click` | 카드 상세 진입 |
| `round_select` | 라운드 최종 선택 |
| `play_start` | 세션 생성 성공 |
| `match_select` | 후보 선택 성공 |
| `session_restore` | 새로고침 복구 |
| `play_complete` | 결과 도달 |
| `share_click` | 링크/이미지 공유 클릭 |
| `create_start` | 만들기 화면 진입 |
| `candidate_add` | 후보 추가 성공 |
| `validation_error` | 생성 검증 실패 |
| `create_publish` | 발행 성공 |
| `report_submit` | 신고 제출 성공 |
| `moderation_action` | 관리자 처리 |

## 8. Playwright 검증 포인트

- 모바일 390px에서 홈 -> 상세 -> 라운드 선택 -> 플레이 -> 결과 -> 링크 복사 완료
- 데스크톱 1440px에서 탐색 필터 변경 후 카드 클릭으로 상세 진입
- 16강 플레이 중 좌/우 클릭, 키보드 선택, Esc 종료 확인 동작
- 플레이 중 새로고침 후 같은 세션 복구 또는 명확한 재시작 안내
- 결과 화면에서 공유 이미지 비율 선택과 링크 복사 동작
- 만들기에서 제목, 후보 4명, 비밀번호만 입력해 발행 가능
- 신고 모달에서 사유 선택, 상세 입력, 제출 성공 toast 확인
- 관리자 신고 큐에서 유지/비공개/삭제/반려 처리 완료
