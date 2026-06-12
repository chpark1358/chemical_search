# 배포 가이드 (Deployment)

이 프로젝트는 **두 개의 서비스**로 구성되며, 한 곳에 다 올릴 수 없다.

| 구성 | 기술 | 배포 위치 | 배포 방식 |
|---|---|---|---|
| 프론트엔드 | Next.js 16 / React 19 | **Vercel** | GitHub 연동 자동 배포 |
| 백엔드 | Python FastAPI + RDKit | **private Hugging Face Space**(Docker SDK) | GitHub Action(`deploy-backend.yml`) 자동 동기화 |

## 토폴로지

```
브라우저
  │  (Supabase 이메일/비밀번호 로그인 필요 — 미들웨어 전역 게이트)
  ▼
Vercel (Next.js)
  ├─ Supabase Auth/DB  (사용자 인증 · RLS per-user 저장/기록)
  └─ /chemical-api/*  ── 런타임 프록시 라우트 ──(Authorization: Bearer CHEMICAL_API_TOKEN)──▶  private HF Space (FastAPI + RDKit)
                                                                                                  └─▶ PubChem · OpenAlex · Crossref · (Semantic Scholar) · Google Patents · SureChEMBL · KIPRIS · Wikidata
```

- **프론트(Vercel)** 는 GitHub 리포에 push하면 자동 빌드/배포된다.
- **백엔드(HF Space)** 는 `scripts/**` 가 바뀌어 `main`에 push되면 GitHub Action `.github/workflows/deploy-backend.yml`이 코드를 private HF Space로 동기화하고, HF가 Docker 이미지를 다시 빌드한다. 즉 백엔드도 프론트처럼 자동 배포된다.
- 브라우저는 항상 Vercel 도메인하고만 통신한다. `/chemical-api/*` 요청은 런타임 프록시 라우트(`src/app/chemical-api/[...path]/route.ts`)가 `CHEMICAL_API_URL`(HF Space URL)로 포워딩하면서 `CHEMICAL_API_TOKEN`을 `Authorization: Bearer`로 주입한다(동일 출처라 CORS 불필요).

## 왜 백엔드는 Vercel(서버리스)에 못 올리나

1. **상태 보존이 필요하다.** 검색은 `생성(POST) → 폴링(GET) → (필요 시) 후보 선택`으로 이어지는데, 검색 레코드를 인메모리 dict에 두고 백그라운드 작업으로 논문·특허를 채운다. Vercel 서버리스는 요청마다 인스턴스가 다를 수 있어 폴링이 다른 인스턴스로 가면 404가 나고, 응답 후 함수가 동결되어 백그라운드 작업이 끝나지 않는다.
2. **RDKit이 무겁다.** 네이티브 의존성이 커서 서버리스 용량 제한과 충돌하기 쉽다.

→ 백엔드는 **단일 워커로 상시 떠 있는 프로세스**가 필요하다. 현재는 Docker SDK 기반 private HF Space(`--workers 1`, port 7860)에서 구동한다.

> 런타임 프록시(=`next.config` rewrite가 아님)를 쓰는 이유: rewrite는 빌드 시점에 대상 URL을 박지만, 프록시 라우트는 요청마다 `CHEMICAL_API_URL`을 읽으므로 백엔드 URL을 바꿔도 **재빌드 없이** Vercel 환경 변수만 수정하면 된다.

---

## 0. 사전 준비

- GitHub에 푸시: `git push origin main` (원격: `github.com/chpark1358/chemical_search`)
- 계정: [Vercel](https://vercel.com), [Hugging Face](https://huggingface.co), [Supabase](https://supabase.com)
- HF: Docker SDK private Space 1개(예: `Rufuspark/chemical-search-api`), WRITE 토큰 1개(동기화용), read 토큰 1개(프록시/keepalive용)
- (선택) 키: KIPRIS Plus `REST AccessKey`(한국 특허), Semantic Scholar API key(대개 불필요)
- ⚠️ `.env`는 git에 올리지 않는다(이미 `.gitignore` 처리됨). 키는 각 플랫폼의 환경 변수/시크릿에 직접 넣는다.

---

## 1. Supabase 설정 (인증 + 사용자별 데이터)

앱 전체가 Supabase 인증 게이트 뒤에 있으므로 가장 먼저 설정한다.

1. Supabase → **New project** 생성. 생성되면 **Project Settings → API**에서 `Project URL`과 `anon public` 키를 확보한다(각각 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
2. **SQL Editor → New query**에서 리포의 `supabase/schema.sql`을 그대로 붙여 실행한다. `saved_items`(저장됨 라이브러리)와 `search_history`(검색 기록) 테이블이 만들어지고 **RLS**가 켜져 각 사용자가 자기 행만 보도록 정책이 설정된다.
3. **Authentication → Providers → Email** 활성화. **Authentication → Sign In / Providers**(또는 Settings)에서 **Confirm email을 끈다(off)** — 이메일/비밀번호 즉시 로그인용.
4. **Authentication → URL Configuration**에서 **Site URL**을 배포 도메인(예: `https://<프로젝트>.vercel.app`)으로 설정한다. 로컬 개발도 함께 쓰면 `http://localhost:3000`을 Redirect URLs에 추가한다.

---

## 2. 백엔드 배포 (private Hugging Face Space)

백엔드는 GitHub Action으로 자동 동기화되므로 직접 파일을 올릴 필요가 없다. 한 번만 셋업하면 이후 `scripts/**` 변경은 push만으로 반영된다.

1. HF에서 **Docker SDK** 기반 **private** Space를 만든다(예: `Rufuspark/chemical-search-api`). Space 이름이 다르면 `deploy-backend.yml`과 `keepalive.yml`의 Space/호스트 문자열을 맞춘다.
2. GitHub 리포 **Settings → Secrets and variables → Actions**에 시크릿 추가:
   - `HF_WRITE_TOKEN` — HF **WRITE** 토큰. Action이 코드를 Space로 push할 때 사용한다.
   - `HF_TOKEN` — HF **read** 토큰. keepalive 워크플로가 private Space `/health`를 인증 호출할 때 사용한다.
3. HF Space **Settings → Variables and secrets**에 백엔드 환경 변수(아래 표의 "백엔드(HF)" 항목)를 넣는다: `KIPRIS_SERVICE_KEY`(선택), `CROSSREF_MAILTO`(권장), `OPENALEX_MAILTO`(선택) 등. 캐시 경로 `CHEMICAL_SEARCH_CACHE_DIR=/tmp/chemical-cache`는 Dockerfile에 이미 들어 있다.
4. `scripts/**`를 `main`에 push(또는 Actions에서 `deploy-backend` 수동 실행)하면 Action이 Space로 동기화 → HF가 Docker 빌드 → `https://<owner>-<space>.hf.space`에서 구동된다.
5. health 확인(private이라 인증 필요): `curl -H "Authorization: Bearer <HF read token>" https://<owner>-<space>.hf.space/health` → `{"status":"ok"}`.

> private Space는 무요청 48h 후 슬립할 수 있어, `.github/workflows/keepalive.yml`이 ~30분마다 `/health`를 인증 핑한다(`HF_TOKEN` 사용).

---

## 3. 프론트엔드 배포 (Vercel)

1. Vercel → **Add New → Project** → 이 GitHub 리포 연결.
2. 설정(대부분 자동 감지):
   - Framework Preset: **Next.js**
   - Root Directory: **`./`** (리포 루트)
   - Build Command / Output: 기본값 (`next build`)
3. **Environment Variables** 에 추가 (Production + Preview 모두):
   - `NEXT_PUBLIC_SUPABASE_URL` = 1단계의 Project URL (필수)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = 1단계의 anon 키 (필수, 공개 키)
   - `CHEMICAL_API_URL` = 2단계의 HF Space URL `https://<owner>-<space>.hf.space` (끝에 `/` 없이)
   - `CHEMICAL_API_TOKEN` = HF **read** 토큰 (private Space 호출용 Bearer)
4. **Deploy**. 끝나면 `https://<프로젝트>.vercel.app` 접속 → 로그인 → 검색 동작 확인.

> 프록시는 런타임에 `CHEMICAL_API_URL`/`CHEMICAL_API_TOKEN`을 읽으므로, 백엔드 URL/토큰을 바꾸면 Vercel 환경 변수만 수정하고 재배포(redeploy)하면 된다. 빌드에 박히지 않는다.

---

## 4. 환경 변수 정리

| 변수 | 어디에 | 필수 | 설명 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Vercel(프론트)** | ✅ | Supabase 프로젝트 URL. 인증 게이트·사용자별 저장/기록에 사용. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Vercel(프론트)** | ✅ | Supabase anon(공개) 키. 설계상 공개(브라우저 노출, 접근 제어는 RLS). |
| `CHEMICAL_API_URL` | **Vercel(프론트)** | 권장 | HF Space 공개 URL. 미설정 시 `127.0.0.1:8000`(로컬)로 가서 프로덕션에서 502. |
| `CHEMICAL_API_TOKEN` | **Vercel(프론트)** | 권장 | private HF Space 호출용 Bearer 토큰(HF read). 미설정 시 private Space는 401/403. |
| `HF_WRITE_TOKEN` | **GitHub Actions 시크릿** | ✅(백엔드 자동배포) | 백엔드를 HF Space로 동기화(`deploy-backend.yml`). HF WRITE 토큰. |
| `HF_TOKEN` | **GitHub Actions 시크릿** | 권장 | private Space keepalive 핑(`keepalive.yml`). HF read 토큰. |
| `CROSSREF_MAILTO` | **HF Space(백엔드)** | 권장 | Crossref polite pool용 이메일 |
| `OPENALEX_MAILTO` | **HF Space(백엔드)** | 권장 | OpenAlex polite pool용 이메일 (미설정 시 `CROSSREF_MAILTO` 사용) |
| `KIPRIS_SERVICE_KEY` | **HF Space(백엔드)** | 선택 | KIPRIS Plus REST AccessKey (한국 특허). 미설정 시 KIPRIS 비활성(오류 아님) |
| `SEMANTIC_SCHOLAR_API_KEY` | **HF Space(백엔드)** | 선택 | 미설정 시 기본 source에서 제외(무인증은 429 잦음 — OpenAlex/Crossref가 대체) |
| `CHEMICAL_SEARCH_CACHE_DIR` | **HF Space(백엔드)** | 선택 | 캐시 경로. Dockerfile 기본 `/tmp/chemical-cache` |

---

## 5. 인증 · 보안 (2계층)

이 앱은 **두 계층**으로 보호된다(이전의 "백엔드 무인증 / O-010 미해결 / 공유 시크릿은 향후 작업" 상태를 대체한다).

1. **프론트 게이트 — Supabase 인증.** `src/middleware.ts`가 모든 요청을 전역 게이트한다. 로그인하지 않은 사용자는 앱 경로에서 `/login`으로 리다이렉트되고, `/chemical-api/*` 프록시는 HTML 대신 **401 JSON**을 돌려준다(클라이언트 fetch가 깔끔히 처리). 즉 백엔드 프록시도 로그인 세션을 요구한다. 사용자별 저장/기록은 Supabase에 저장되며 **RLS**로 각 사용자가 자기 행만 접근한다(`supabase/schema.sql`).
2. **백엔드 보호 — 프록시 Bearer 토큰 + private Space.** HF Space가 **private**이라 외부에서 직접 호출하려면 HF 토큰이 필요하다. 프록시 라우트는 브라우저가 절대 못 보는 `CHEMICAL_API_TOKEN`(서버 측 env)을 `Authorization: Bearer`로 주입해 private Space를 인증 호출한다. 토큰이 없거나 Space가 public이 아니면 외부 직접 호출은 401/403이 된다.

남은 리스크:

- **서버 측 rate limit이 강제되지 않는다.** 로그인한 사용자가 검색을 반복하면 외부 API 한도(KIPRIS Plus, Semantic Scholar 등)를 소진할 수 있다. 운영 확장 시 프록시 또는 백엔드에 사용자/IP 단위 레이트리밋을 추가할 것.
- **Google Patents는 비공식 XHR provider다.** 공개 API 계약이 없고, 데이터센터 IP(HF Space) 차단 가능성과 ToS 회색지대가 있다. 차단 시 graceful error로 떨어지며 SureChEMBL/KIPRIS가 특허 탭을 계속 채운다(D-018).
- 외부 API 한도: KIPRIS Plus는 발급 키 등급별 호출 한도가 있다(무료 한도 내 사용). OpenAlex는 mailto polite pool로 넉넉(10 rps).
- 단일 워커 전제: 백엔드를 멀티 워커/멀티 인스턴스로 키우면 인메모리 검색 레코드가 공유되지 않아 폴링이 깨진다(O-009). 스케일이 필요하면 레코드 스토어를 외부(Redis 등)로 이관해야 한다.

---

## 6. 연결 확인 / 트러블슈팅

- **로그인 화면에서 못 넘어감 / 콘솔에 Supabase 오류** → Vercel의 `NEXT_PUBLIC_SUPABASE_*`가 비었거나 틀림, 또는 Supabase Auth의 Site URL이 배포 도메인과 불일치. Confirm email이 켜져 있으면 확인 메일 없이는 로그인 안 됨(off 권장).
- **로그인했는데 검색 시 401** → 세션 만료(다시 로그인) 또는 미들웨어가 `/chemical-api`를 게이트한 상태. 정상 로그인 세션이면 통과한다.
- **502 / "검색 서버에 연결할 수 없습니다"** → Vercel의 `CHEMICAL_API_URL`이 비었거나 틀림, 또는 HF Space 슬립/빌드 실패. `Authorization: Bearer <HF read token>`로 `https://<owner>-<space>.hf.space/health`를 직접 호출해 확인.
- **HF Space /health가 401/403** → `CHEMICAL_API_TOKEN`(Vercel) 또는 `HF_TOKEN`(keepalive)이 비었거나, Space가 private인데 토큰 권한이 없음.
- **백엔드 변경이 반영 안 됨** → GitHub Actions의 `deploy-backend` 실행 결과 확인. `HF_WRITE_TOKEN` 미설정/만료면 동기화가 스킵/실패한다.
- **검색이 계속 '검색 중'** → HF Space 콜드스타트(슬립 후 첫 요청) 또는 백그라운드 작업 지연. 잠시 후 재시도.
- **Google Patents만 error** → 비공식 XHR 차단(데이터센터 IP/403)일 수 있다. 특허 탭은 SureChEMBL/KIPRIS로 계속 채워진다.
- **KIPRIS만 error** → `KIPRIS_SERVICE_KEY` 미설정/오타, 또는 신규 발급 키 미활성. KIPRIS가 빠져도 나머지는 정상.
- **빌드 실패(RDKit)** → `requirements-poc.txt`의 `rdkit` 버전이 호스트 파이썬과 안 맞으면 최신 안정 버전으로 조정.

---

## 7. 로컬 실행 (참고)

```bash
# 백엔드 (포트 8000) — .env를 자동 로드한다. 로컬은 인증 없이 띄울 수 있다(CHEMICAL_API_TOKEN 비움).
.venv-chemical/Scripts/python.exe -m uvicorn --app-dir scripts chemical_search.api:app --reload --port 8000
# 프론트 (포트 3000) — /chemical-api/* 를 127.0.0.1:8000 으로 프록시(기본값)
# 로그인 게이트 통과를 위해 .env에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 필요
npm run dev
```
자세한 셋업은 [README.md](./README.md) 참고.
