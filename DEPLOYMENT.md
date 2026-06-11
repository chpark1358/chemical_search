# 배포 가이드 (Deployment)

이 프로젝트는 **두 개의 서비스**로 구성되며, 한 곳에 다 올릴 수 없다.

| 구성 | 기술 | 배포 위치 |
|---|---|---|
| 프론트엔드 | Next.js 16 / React 19 | **Vercel** |
| 백엔드 | Python FastAPI + RDKit | **상시 구동 컨테이너 호스트** (Render / Railway / Fly.io / Cloud Run) |

## 왜 백엔드는 Vercel(서버리스)에 못 올리나

1. **상태 보존이 필요하다.** 검색은 `생성(POST) → 폴링(GET) → (필요 시) 후보 선택`으로 이어지는데, 검색 레코드를 인메모리 dict에 두고 백그라운드 작업으로 논문·특허를 채운다. Vercel 서버리스는 요청마다 인스턴스가 다를 수 있어 폴링이 다른 인스턴스로 가면 404가 나고, 응답 후 함수가 동결되어 백그라운드 작업이 끝나지 않는다.
2. **RDKit이 무겁다.** 네이티브 의존성이 커서 서버리스 용량 제한과 충돌하기 쉽다.

→ 백엔드는 **단일 워커로 상시 떠 있는 프로세스**가 필요하다(컨테이너 호스트). 프론트는 Vercel에 올리고, 브라우저는 Vercel 도메인하고만 통신하며, Vercel 서버가 `/chemical-api/*`를 백엔드로 프록시한다(`src/app/chemical-api/[...path]/route.ts`, 런타임에 `CHEMICAL_API_URL`을 읽음 → URL 변경 시 **재빌드 불필요**, 동일 출처라 CORS 설정도 불필요).

```
브라우저 ──> Vercel (Next.js)  ──/chemical-api/*──>  FastAPI 백엔드 (Render 등)
                                                      └─> PubChem · OpenAlex · Crossref · SureChEMBL · KIPRIS Plus · Wikidata
```

---

## 0. 사전 준비

- GitHub에 푸시: `git push origin main` (원격: `github.com/chpark1358/chemical_search`)
- 계정: [Vercel](https://vercel.com), 백엔드 호스트(예: [Render](https://render.com))
- (선택) 키: KIPRIS Plus `REST AccessKey`(한국 특허), Semantic Scholar API key(대개 불필요)
- ⚠️ `.env`는 git에 올리지 않는다(이미 `.gitignore` 처리됨). 키는 각 플랫폼의 환경 변수에 직접 넣는다.

---

## 1. 백엔드 배포 (먼저 — 프론트가 이 URL을 가리켜야 함)

리포 루트에 `Dockerfile`과 `render.yaml`이 있다. 백엔드는 `scripts/` + `requirements-poc.txt`만 사용한다.

### Render (권장, 가장 간단)

1. Render → **New → Blueprint** → 이 GitHub 리포 연결 → `render.yaml` 자동 인식.
2. 배포 중 환경 변수 입력(아래 표의 "백엔드" 항목). `CHEMICAL_SEARCH_CACHE_DIR`은 `render.yaml`에 이미 `/tmp/chemical-cache`로 지정됨.
3. 배포 후 서비스 URL 확보: 예 `https://chemical-search-api.onrender.com`.
4. health 확인: 브라우저로 `https://<백엔드>/health` → `{"status":"ok"}`.

> Render Free 플랜은 15분 무요청 시 슬립 → 첫 요청이 수십 초 걸릴 수 있다. 데모엔 무방, 상시 응답이 필요하면 유료 플랜.

### 대안 호스트
- **Railway**: New Project → Deploy from repo → Dockerfile 자동 인식 → Variables에 env 입력. `$PORT` 자동 주입.
- **Fly.io**: `fly launch`(기존 Dockerfile 사용) → `fly secrets set KIPRIS_SERVICE_KEY=... CROSSREF_MAILTO=...` → `fly deploy`.
- **Cloud Run**: `gcloud run deploy --source .` (Dockerfile 사용), 환경 변수는 `--set-env-vars`.
- 공통 전제: 단일 워커(`--workers 1`, Dockerfile에 이미 지정), `$PORT` 바인딩(이미 처리), `/health` 헬스체크.

---

## 2. 프론트엔드 배포 (Vercel)

1. Vercel → **Add New → Project** → 이 GitHub 리포 연결.
2. 설정(대부분 자동 감지):
   - Framework Preset: **Next.js**
   - Root Directory: **`./`** (리포 루트)
   - Build Command / Output: 기본값 (`next build`)
3. **Environment Variables** 에 추가 (Production + Preview 모두):
   - `CHEMICAL_API_URL` = `https://<1단계에서 받은 백엔드 URL>` (끝에 `/` 없이)
4. **Deploy**. 끝나면 `https://<프로젝트>.vercel.app` 접속 → 검색 동작 확인.

> 프록시는 런타임에 `CHEMICAL_API_URL`을 읽으므로, 나중에 백엔드 URL을 바꾸면 Vercel 환경 변수만 수정하고 재배포(redeploy)하면 된다. 빌드에 박히지 않는다.

---

## 3. 환경 변수 정리

| 변수 | 어디에 | 필수 | 설명 |
|---|---|---|---|
| `CHEMICAL_API_URL` | **Vercel** | ✅ | 백엔드 공개 URL. 미설정 시 `127.0.0.1:8000`(로컬)로 가서 프로덕션에서 502. |
| `CROSSREF_MAILTO` | **백엔드** | 권장 | Crossref polite pool용 이메일 |
| `OPENALEX_MAILTO` | **백엔드** | 권장 | OpenAlex polite pool용 이메일 (미설정 시 `CROSSREF_MAILTO` 사용) |
| `KIPRIS_SERVICE_KEY` | **백엔드** | 선택 | KIPRIS Plus REST AccessKey (한국 특허). 미설정 시 KIPRIS 비활성(오류 아님) |
| `SEMANTIC_SCHOLAR_API_KEY` | **백엔드** | 선택 | 대개 미설정(무인증 best-effort, 429 잦음 — OpenAlex가 대체) |
| `CHEMICAL_SEARCH_CACHE_DIR` | **백엔드** | 선택 | 캐시 경로. 컨테이너에선 `/tmp/chemical-cache` 권장 |

---

## 4. 연결 확인 / 트러블슈팅

- **502 / "검색 서버에 연결할 수 없습니다"** → Vercel의 `CHEMICAL_API_URL`이 비었거나 틀림, 또는 백엔드가 슬립/다운. `https://<백엔드>/health`를 직접 열어 확인.
- **검색이 계속 '검색 중'** → 백엔드 슬립(Render Free 콜드스타트) 또는 백그라운드 작업 지연. 잠시 후 재시도.
- **KIPRIS만 error** → `KIPRIS_SERVICE_KEY` 미설정/오타, 또는 신규 발급 키 미활성(활성화에 시간이 걸릴 수 있음). KIPRIS가 빠져도 나머지는 정상.
- **한국 특허가 안 보임** → 특허 탭에서 확인(논문 탭과 분리). KIPRIS 비활성 시 SureChEMBL 특허만 표시.
- **빌드 실패(RDKit)** → `requirements-poc.txt`의 `rdkit` 버전이 호스트 파이썬과 안 맞으면 최신 안정 버전으로 조정.

---

## 5. 보안 · 비용 주의

- ⚠️ **백엔드에 인증이 없다(O-010).** 공개 URL이면 누구나 호출 가능 → 외부 API(특히 KIPRIS Plus 한도, Semantic Scholar 키) 소진·남용 위험. 데모 범위에선 감수하되, 공개 운영 시에는 Next ↔ FastAPI 사이 공유 시크릿 헤더 검증이나 레이트리밋을 추가할 것(프록시 라우트에서 헤더 주입 가능).
- 외부 API 한도: KIPRIS Plus는 발급 키 등급별 호출 한도가 있다(무료 한도 내 사용). OpenAlex는 mailto polite pool로 넉넉(10 rps).
- 비용: Vercel Hobby 무료, Render Free(슬립 있음) 무료. 상시 가동은 유료 플랜 필요.
- 단일 워커 전제: 백엔드를 멀티 워커/멀티 인스턴스로 키우면 인메모리 검색 레코드가 공유되지 않아 폴링이 깨진다. 스케일이 필요하면 레코드 스토어를 외부(Redis 등)로 이관해야 한다.

---

## 6. 로컬 실행 (참고)

```bash
# 백엔드 (포트 8000) — .env를 자동 로드한다
.venv-chemical/Scripts/python.exe -m uvicorn --app-dir scripts chemical_search.api:app --reload --port 8000
# 프론트 (포트 3000) — /chemical-api/* 를 127.0.0.1:8000 으로 프록시(기본값)
npm run dev
```
자세한 셋업은 [README.md](./README.md) 참고.
