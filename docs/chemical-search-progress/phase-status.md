# 단계별 진행 상태

최종 업데이트: 2026-06-11

> 2026-06-11 papers-only 피벗(D-010)으로 특허 검색과 ChEMBL 구조 검색 항목은 범위에서 제외됐다. 제외된 항목은 ~~취소선~~과 `범위 제외 (D-010)` 표시로 기록을 유지한다.

## 전체 단계

| 단계 | 목표 | 상태 | 진행률 |
|---|---|---|---:|
| Phase 0 | 기술 검증 | 진행 중 (papers-only 기준) | 70% |
| Phase 1 | POC | 완료 | 100% |
| Phase 2 | MVP-1 (papers-only 재설계) | 진행 중 | 60% |
| Phase 3 | MVP-2 (목표 재정의 필요) | 미시작 | 0% |
| Phase 4 | Research workflow | 미시작 | 0% |
| Phase 5 | Professional tier | 미시작 | 0% |

진행률 참고: 이전 기록(Phase 0 45%, Phase 2 85%)은 ChEMBL/특허 포함 구 스코프 기준이다. papers-only 기준으로 Phase 0은 제외 항목이 빠져 올라갔고, Phase 2는 백엔드 스키마 변경과 UI 재구축이 추가되어 내려갔다.

## Phase 0: 기술 검증

목표: 외부 API와 RDKit 도입 가능성을 빠르게 검증한다.

완료 기준:

- [x] RDKit 설치/구조 표준화 검증
- [x] PubChem name/formula/SMILES lookup 검증
- [x] ~~ChEMBL similarity/substructure query 검증~~ 범위 제외 (D-010, 검증 이력은 유지)
- [ ] Semantic Scholar 논문 검색 검증: 현재 HTTP 429, API key 또는 retry 필요
- [x] Crossref DOI/title metadata 보강 검증
- [ ] ~~SureChEMBL compound-patent association 샘플 검증~~ 범위 제외 (D-010)
- [ ] ~~EPO OPS OAuth/token/publication lookup 검증~~ 범위 제외 (D-010)
- [ ] Ketcher SMILES export 검증: papers-only 재설계 이후 도입 여부 재평가
- [ ] OPSIN 도입 여부 판단
- [ ] provider별 go/no-go 표 작성: 대상은 PubChem/Semantic Scholar/Crossref

## Phase 1: POC

목표: CLI 또는 단순 API로 구조 정규화와 compound/paper 검색의 핵심 흐름을 검증한다.

완료 기준:

- [x] SMILES/name/formula 입력 처리
- [x] RDKit normalize 구현
- [x] PubChem compound lookup 구현 (~~ChEMBL lookup~~ 범위 제외, 구현 이력 유지)
- [x] ~~ChEMBL similarity/substructure 구현~~ 범위 제외 (D-010, 제거 대상)
- [x] Semantic Scholar/Crossref paper lookup 구현
- [x] JSON/Markdown 결과 출력
- [x] source URL과 match reason 표시

## Phase 2: MVP-1 (papers-only 재설계)

목표: papers-only 검색 흐름과 Linear 스타일 웹 UI를 구현한다.

진행 순서:

1. provider 안정화
2. 결과 병합/ranking/evidence 계약
3. 검색 API와 candidate selection
4. papers-only 스키마 전환과 루트 라우트 UI 재구축

완료 기준 (구 스코프에서 이어지는 항목):

- [x] Next.js 검색 UI: `/chemical` 기준 완료, 루트 라우트 Linear 스타일로 재구축 중 (D-011)
- [ ] ~~Ketcher 구조 입력~~ 보류, 재설계 이후 재평가
- [x] candidate selection UI/API: papers-only 계약으로 변경 중
- [x] 결과 병합/랭킹/evidence 표시: ChEMBL 제거 후 논문 결과 기준으로 변경 중
- [x] CSV/Markdown export
- [x] partial result 처리: 상태값 `partial_failed` → `partial` 개명 진행 중
- [x] basic cache/throttle

완료 기준 (2026-06-11 재설계 추가):

- [ ] FastAPI papers-only record 스키마 (상태값 `needs_candidate_selection | running | done | partial | failed`)
- [ ] ChEMBL/threshold 파라미터 제거와 API 계약 테스트 갱신
- [ ] 루트 라우트 `/` Linear 스타일 UI (`src/lib/api.ts` 기반, `/chemical` 라우트 제거)
- [ ] Python/웹 테스트가 새 계약 기준으로 통과

## Phase 3: MVP-2 (목표 재정의 필요)

목표: ~~특허 검색과~~ evidence-locked AI 요약 등 papers-only 기준의 다음 기능을 정의한다.

완료 기준:

- [ ] ~~SureChEMBL patent lookup~~ 범위 제외 (D-010)
- [ ] ~~EPO OPS metadata 보강~~ 범위 제외 (D-010)
- [ ] ~~patent result card~~ 범위 제외 (D-010)
- [ ] evidence-locked AI summary
- [ ] 검색 히스토리
- [ ] provider diagnostics dashboard

## Phase 4: Research workflow

- [ ] 사용자 계정
- [ ] saved searches/projects
- [ ] ~~patent family grouping 고도화~~ 범위 제외 (D-010)
- [ ] richer report builder
- [ ] background job queue
- [ ] 검색 결과 feedback loop

## Phase 5: Professional tier

- [ ] local structure index 구축
- [ ] ~~bulk patent/literature ingestion~~ 논문 ingestion만 검토 (특허는 범위 제외, D-010)
- [ ] OSRA/DECIMER image recognition
- [ ] OpenSearch/chemical fingerprint index
- [ ] enterprise audit logs
- [ ] 유료 데이터 provider 연동 검토
- [ ] advanced claim/evidence extraction
