# 개발 진행 로그

## 2026-06-11: OpenAlex 논문 프로바이더 추가

상태: 진행 중

### 목적

Semantic Scholar API key 신규 발급 중단(O-007)에 대응해 OpenAlex를 Crossref와 함께 주력 논문 소스로 추가하고, Semantic Scholar는 무인증 best-effort로 유지한다.

### 진행 내용

- OpenAlex 소스 추가 결정 기록 (D-013): API key 불필요, `mailto` 지정 시 polite pool 10 rps / 일 100k 요청
- 유효 소스를 `semantic_scholar | crossref | openalex` 3개로 확장, `sources` 미지정 시 기본값은 3개 전체
- 결과 병합(중복 제거) 우선순위를 `semantic_scholar > openalex > crossref`로 정의 (기존 citations/abstract/venue/doi/url/year backfill 유지)
- `OPENALEX_MAILTO` 환경 변수 추가 (미설정 시 `CROSSREF_MAILTO` 사용, 둘 다 없으면 mailto 파라미터 생략)
- O-007을 '완화'로 갱신: OpenAlex가 주력 소스를 대체, Semantic Scholar key 발급은 사실상 불가(무료 도메인·서드파티 앱 신청 중단)
- `README.md`, `.env.example`, 진행 문서를 3개 논문 소스 기준으로 갱신

### 변경 파일

- `README.md`
- `.env.example`
- `docs/chemical-search-progress/current-status.md`
- `docs/chemical-search-progress/decision-log.md`
- `docs/chemical-search-progress/open-issues.md`
- `docs/chemical-search-progress/progress-log.md`

### 검증

- 문서 정비 작업으로 코드 검증 없음. OpenAlex provider/pipeline/UI 구현의 lint/테스트 결과는 해당 작업 종료 시 기록한다.

### 다음 작업

1. `scripts/chemical_search` OpenAlex adapter 구현 (상태 분류 ok/empty/rate_limited/timeout/error, abstract_inverted_index 복원)
2. `results.py` 병합 우선순위 `semantic_scholar > openalex > crossref` 반영과 테스트
3. UI 소스 칩·필터에 OpenAlex 추가

## 2026-06-11: 논문 전용(papers-only) 피벗과 재설계 착수

상태: 진행 중

### 목적

제품 스코프를 화학물질 기반 논문 검색으로 축소하고, 저장소/문서/계약을 새 스코프 기준으로 재정렬한다.

### 진행 내용

- Phase 1-2 작업을 베이스라인 커밋 `1c45ee5`로 스냅샷 (`.gitattributes` LF 정규화 포함)
- 월드컵 앱을 커밋 `9cd47e2`에서 제거 (git 히스토리로 복원 가능)
- 피벗 결정 3건 기록: D-010 논문 전용 축소, D-011 Linear 스타일 루트 UI 재설계, D-012 월드컵 앱 제거
- API 계약을 papers-only로 재정의: 상태값 `needs_candidate_selection | running | done | partial | failed` (`partial_failed` → `partial` 개명), ChEMBL/threshold 파라미터 제거
- 루트 라우트 `/` Linear 스타일 UI와 FastAPI papers-only 스키마 재작업 진행 중
- 루트 `README.md` 신규 작성, `.env.example` 월드컵 변수 제거, `AGENTS.md` 구조/검증 명령/문서 갱신 의무 추가
- 진행 문서(current-status, phase-status, decision-log, open-issues)를 새 스코프 기준으로 갱신

### 기록 정정

- 2026-06-10 GitHub 설정 항목에 기록된 초기 커밋 `13a31c5`는 현재 git 히스토리에 존재하지 않는다. 실제 기준 커밋은 `b2963ad`다 (히스토리 정리로 추정).

### 변경 파일

- `README.md` (신규)
- `.env.example`
- `AGENTS.md`
- `docs/chemical-search-progress/` 전반
- `docs/chemical-structure-patent-literature-search-plan.md` (스코프 변경 공지 추가)

### 검증

- 문서 정비 작업으로 코드 검증 없음. 백엔드/프론트 재작업의 lint/테스트 결과는 해당 작업 종료 시 기록한다.

### 다음 작업

1. FastAPI papers-only 계약 구현과 테스트 통과
2. 루트 라우트 Linear 스타일 UI 구현과 브라우저 검증
3. `httpx2` 미사용 의존성 제거 (O-011)

## 2026-06-10: 출처 신뢰도와 자료 처리 흐름 안내 UI 추가

상태: 완료

### 목적

사용자가 검색 결과의 출처별 역할과 앱의 자료 수집·정리 방식을 쉽게 이해하고 올바르게 해석할 수 있게 한다.

### 진행 내용

- PubChem, ChEMBL, Crossref, Semantic Scholar, Google Patents의 권장 용도와 한계 표시
- 구조 식별, 생물활성, 논문 식별, 특허 탐색별 우선 출처 안내
- 입력 감지부터 구조 정규화, 병렬 수집, 중복 제거, 결과 표시까지 5단계 처리 흐름 시각화
- Rank score가 과학적 정확도나 법적 판단 점수가 아님을 명시
- 각 provider 공식 문서 링크 추가

### 검증

- `npm run lint`와 `npm run build` 통과
- 좁은 브라우저 화면에서 카드 세로 정렬과 안내 문구 가독성 확인
- 브라우저 콘솔 경고/오류 없음

## 2026-06-10: Phase 2 Chemical Search 웹 UI 구현

상태: 완료

### 목적

기존 월드컵 화면과 분리된 Chemical Search 작업공간에서 FastAPI 검색, 후보 선택, 결과 확인, export 흐름을 실제로 사용할 수 있게 한다.

### 진행 내용

- `/chemical` 전용 Next.js route와 metadata 추가
- `/chemical-api` 동일 출처 rewrite와 typed API client 추가
- name/formula/SMILES 입력, 검색 모드, threshold, provider 선택 UI 추가
- formula 후보 선택과 검색 상태 polling 추가
- normalized compound, provider diagnostics, partial 상태, ranked result/evidence 표시
- JSON/Markdown/CSV export 링크 추가

### 검증

- `npm run lint` 통과
- `npm run build` 통과, `/chemical` static route 생성
- Chemical 백엔드 단위/API 테스트 14개 통과
- 실제 브라우저 aspirin 검색과 `C9H8O4` 후보 선택 흐름 통과
- 실제 브라우저 콘솔 경고/오류 없음

### 다음 작업

1. Ketcher 구조 입력 검증 및 통합
2. 브라우저 회귀 테스트 자동화
3. 인메모리 검색 상태 저장소 교체 설계

## 2026-06-10: Phase 2 계획 재정렬 및 기반 구현

상태: 완료

### 목적

Phase 1 결과를 기준으로 기존 웹 UI 우선 계획을 점검하고, API/UI 재작업을 줄이도록 Phase 2 선행 기반을 구현한다.

### 진행 내용

- 구현 순서를 `provider 안정화 -> 결과 계약 -> 검색 API -> 웹 UI`로 변경
- project Python 3.11 venv와 직접 의존성 버전 고정
- hashed file cache, retry/backoff, throttle, Crossref `mailto` 지원
- InChIKey/DOI 중복 제거, deterministic ranking, evidence 구조화
- CSV export와 10개 품질 fixture 추가
- FastAPI normalize/search/candidate selection/result/export API 추가
- 인메모리 검색 상태의 운영 한계를 오픈 이슈로 기록

### 검증

- project venv에서 단위/API 계약 테스트 12개 통과
- 정규화 품질 fixture 10/10 통과
- 실제 aspirin name/formula 검색과 cache hit 확인
- FastAPI 실제 서버 `/health`, `/api/chem/normalize` smoke test 통과

### 다음 작업

1. Chemical Search 전용 Next.js 화면과 FastAPI client 구현
2. candidate selection/ranked result/evidence UI 구현
3. Ketcher 통합
4. PostgreSQL/Redis 기반 상태 저장 설계

## 2026-06-10: Phase 1 Chemical Search CLI POC 구현

상태: 완료

### 목적

구조 정규화와 compound/paper 검색의 핵심 흐름을 웹 UI 이전에 CLI로 검증한다.

### 진행 내용

- SMILES/name/formula/InChI/InChIKey 입력 감지 구현
- RDKit 구조 정규화 구현
- PubChem 후보 resolver 구현
- ChEMBL exact/similarity/substructure adapter 구현
- Semantic Scholar/Crossref paper adapter 구현
- provider 실패 시 partial result 유지
- JSON/Markdown 출력과 source URL/match reason 표시
- 단위 테스트와 실제 aspirin 검색 실행

### 변경 파일

- `scripts/chemical_search/`
- `tests/test_chemical_search_poc.py`
- `docs/chemical-search-progress/`

### 검증

- 단위 테스트 5개 통과
- aspirin name 검색 성공
- `C9H8O4` formula 후보 선택 검색 성공
- aspirin SMILES 검색 성공
- invalid SMILES partial 결과 확인

### 다음 작업

1. Phase 2 웹 검색 UI와 API 설계
2. provider cache/throttle/retry 구현
3. 결과 병합, 중복 제거, ranking 구현

## 2026-06-10: GitHub 저장소 초기 설정 및 커밋

상태: 완료

### 목적

현재 프로젝트를 `https://github.com/chpark1358/chemical_search.git`에 저장해 다른 PC에서 이어서 개발할 수 있도록 한다.

### 진행 내용

- 원격 저장소가 비어 있는지 확인
- 커밋 대상 비밀값 검사
- 로컬 도구/생성물 제외 규칙 추가
- 초기 Git 저장소와 원격 연결 준비
- Python Phase 0 spike 문법 검증 통과
- 기존 WorldCup 앱 lint/smoke 실패 상태 기록
- 초기 커밋 `13a31c5` 생성
- `origin/main` 원격 푸시 성공

### 주의사항

- 현재 프로젝트 폴더에는 기존 WorldCup Next.js 코드가 함께 존재한다.
- `.env`, API 키, Codex 로컬 설정, Graphify DB, 테스트 생성물은 제외한다.

### 다음 작업

- 원격 저장소에서 초기 커밋 확인
- 다른 PC에서 clone/install 절차 검증

## 2026-06-02: 개발 진행 문서 체계 생성

상태: 완료

### 목적

개발이 진행될 때마다 어디까지 진행됐고, 어떤 방식으로 진행됐는지 Markdown 파일로 남기기 위한 문서 체계를 만든다.

### 진행 내용

- `docs/chemical-search-progress/` 폴더 생성
- 현재 상태 문서 생성
- 단계별 상태 문서 생성
- 누적 진행 로그 생성
- 의사결정 로그 생성
- 오픈 이슈 문서 생성
- 작업 종료 보고서 템플릿 생성
- 첫 작업 종료 보고서 생성

### 변경 파일

- `docs/chemical-search-progress/README.md`
- `docs/chemical-search-progress/current-status.md`
- `docs/chemical-search-progress/phase-status.md`
- `docs/chemical-search-progress/progress-log.md`
- `docs/chemical-search-progress/decision-log.md`
- `docs/chemical-search-progress/open-issues.md`
- `docs/chemical-search-progress/templates.md`
- `docs/chemical-search-progress/session-reports/2026-06-02-progress-documentation-setup.md`

### 검증

- 문서 파일 UTF-8 생성
- Graphify 업데이트 예정

### 다음 작업

- Phase 0 API spike 또는 POC 프로젝트 구조 생성
## 2026-06-02: Phase 0 API spike 1차 구현 및 실행

상태: 완료

### 목적

POC/MVP 개발 전에 실제 외부 데이터 소스와 RDKit 정규화가 현재 환경에서 동작하는지 검증한다.

### 진행 내용

- `scripts/chemical_search/phase0_api_spike.py` 작성
- `scripts/chemical_search/requirements-phase0.txt` 작성
- RDKit 설치 전 상태 확인
- `rdkit==2026.3.2` 설치
- aspirin 기준 Phase 0 provider check 실행
- 결과를 JSON/Markdown으로 저장
- Semantic Scholar query fallback 로직 추가
- 기본 실행은 provider error가 있어도 리포트 생성 성공으로 처리하고, `--strict` 옵션으로 엄격 모드를 제공하도록 수정

### 변경 파일

- `scripts/chemical_search/phase0_api_spike.py`
- `scripts/chemical_search/requirements-phase0.txt`
- `output/chemical-search/phase0_api_spike.md`
- `output/chemical-search/phase0_api_spike.json`
- `docs/chemical-search-progress/current-status.md`
- `docs/chemical-search-progress/phase-status.md`
- `docs/chemical-search-progress/progress-log.md`
- `docs/chemical-search-progress/decision-log.md`
- `docs/chemical-search-progress/open-issues.md`
- `docs/chemical-search-progress/session-reports/2026-06-02-phase0-api-spike.md`

### 검증

```powershell
py -m pip install --user rdkit==2026.3.2
$env:PYTHONUTF8='1'; py scripts\chemical_search\phase0_api_spike.py --out output\chemical-search
$env:PYTHONUTF8='1'; py -m py_compile scripts\chemical_search\phase0_api_spike.py
```

결과:

- ok: 6
- partial: 1
- skipped: 1
- error: 1

### 다음 작업

1. SureChEMBL TLS/endpoint 문제 조사
2. Semantic Scholar API key 또는 fallback 정책 결정
3. EPO OPS credentials 필요 여부 결정
4. Phase 1 POC 구조 설계
