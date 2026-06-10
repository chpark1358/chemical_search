# 개발 진행 로그

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
