# 단계별 진행 상태

최종 업데이트: 2026-06-10

## 전체 단계

| 단계 | 목표 | 상태 | 진행률 |
|---|---|---|---:|
| Phase 0 | 기술 검증 | 진행 중 | 45% |
| Phase 1 | POC | 완료 | 100% |
| Phase 2 | MVP-1 | 진행 중 | 85% |
| Phase 3 | MVP-2 | 미시작 | 0% |
| Phase 4 | Research workflow | 미시작 | 0% |
| Phase 5 | Professional tier | 미시작 | 0% |

## Phase 0: 기술 검증

목표: 외부 API와 RDKit/Ketcher 도입 가능성을 빠르게 검증한다.

완료 기준:

- [x] RDKit 설치/구조 표준화 검증
- [x] PubChem name/formula/SMILES lookup 검증
- [x] ChEMBL similarity/substructure query 검증
- [ ] Semantic Scholar 논문 검색 검증: 현재 HTTP 429, API key 또는 retry 필요
- [x] Crossref DOI/title metadata 보강 검증
- [ ] SureChEMBL compound-patent association 샘플 검증: 현재 TLS 인증서 검증 실패
- [ ] EPO OPS OAuth/token/publication lookup 검증: credentials 미설정
- [ ] Ketcher SMILES export 검증
- [ ] OPSIN 도입 여부 판단
- [ ] provider별 go/no-go 표 작성

## Phase 1: POC

목표: CLI 또는 단순 API로 구조 정규화와 compound/paper 검색의 핵심 흐름을 검증한다.

완료 기준:

- [x] SMILES/name/formula 입력 처리
- [x] RDKit normalize 구현
- [x] PubChem/ChEMBL compound lookup 구현
- [x] ChEMBL similarity/substructure 구현
- [x] Semantic Scholar/Crossref paper lookup 구현
- [x] JSON/Markdown 결과 출력
- [x] source URL과 match reason 표시

## Phase 2: MVP-1

목표: 사용 가능한 웹 UI와 후보 선택/결과 표시를 구현한다.

진행 순서:

1. provider cache/throttle/retry
2. 결과 병합/중복 제거/ranking/evidence 계약
3. 검색 API와 candidate selection
4. 웹 UI와 Ketcher

완료 기준:

- [x] Next.js 검색 UI
- [ ] Ketcher 구조 입력
- [x] candidate selection UI/API
- [x] 결과 병합/랭킹/evidence 표시
- [x] CSV/Markdown export
- [x] partial result 처리
- [x] basic cache/throttle

## Phase 3: MVP-2

목표: 특허 검색과 evidence-locked AI 요약을 붙인다.

완료 기준:

- [ ] SureChEMBL patent lookup
- [ ] EPO OPS metadata 보강
- [ ] patent result card
- [ ] evidence-locked AI summary
- [ ] 검색 히스토리
- [ ] provider diagnostics dashboard

## Phase 4: Research workflow

- [ ] 사용자 계정
- [ ] saved searches/projects
- [ ] patent family grouping 고도화
- [ ] richer report builder
- [ ] background job queue
- [ ] 검색 결과 feedback loop

## Phase 5: Professional tier

- [ ] local structure index 구축
- [ ] bulk patent/literature ingestion
- [ ] OSRA/DECIMER image recognition
- [ ] OpenSearch/chemical fingerprint index
- [ ] enterprise audit logs
- [ ] 유료 데이터 provider 연동 검토
- [ ] advanced claim/evidence extraction
