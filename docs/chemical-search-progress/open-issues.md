# 오픈 이슈

최종 업데이트: 2026-06-02

## 높은 우선순위

### O-001: RDKit 실행 환경 결정

상태: 부분 해결

현재 결과:

- Windows Python 3.11 사용자 환경에 `rdkit==2026.3.2` 설치 완료
- aspirin SMILES normalize 성공

남은 결정:

- POC 이후에도 사용자 환경 설치를 유지할지
- project venv, conda, Docker 중 하나로 고정할지

영향:

재현 가능한 개발/배포 환경을 결정해야 한다.

### O-002: SureChEMBL API 안정성 검증

상태: 미해결

현재 결과:

- `https://www.api.surechembl.org/` 호출 시 TLS certificate verification failure 발생

확인 필요:

- 현재 API endpoint와 응답 스키마
- TLS 인증서 문제가 로컬 환경 문제인지 서버 설정 문제인지
- rate limit
- compound-patent association 조회 흐름
- terms of use

영향:

통과하지 못하면 특허 검색은 MVP-2에서 제외하거나 링크아웃/수동 확인 보조로 낮춘다.

### O-003: EPO OPS 인증과 quota 확인

상태: 미해결

현재 결과:

- `EPO_OPS_CONSUMER_KEY`, `EPO_OPS_CONSUMER_SECRET` 미설정으로 skipped

확인 필요:

- OAuth 등록 가능 여부
- 무료 사용량
- publication lookup 샘플
- XML parsing 난이도

영향:

patent metadata/family/legal 보강 가능 여부를 결정한다.

### O-007: Semantic Scholar API key 필요 여부

상태: 미해결

현재 결과:

- 인증 없는 요청에서 HTTP 429 발생

확인 필요:

- `SEMANTIC_SCHOLAR_API_KEY` 발급 여부
- API key 없이 Crossref fallback만으로 MVP-1이 충분한지
- retry/backoff 정책

영향:

논문 검색 품질과 안정성에 영향이 있다.

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

## 낮은 우선순위

### O-006: PDF/image OCR 도입 시점

상태: 보류

현재 판단:

OSRA/DECIMER 기반 구조 이미지 인식은 MVP 범위에서 제외한다.