# 화학 구조 검색 서비스 개발 진행 문서

이 폴더는 화학물질 기반 논문 검색 서비스(papers-only, 2026-06-11 D-010 기준) 개발 진행 상황을 기록한다.

## 문서 구성

- `current-status.md`: 현재 어디까지 진행됐는지 요약한다.
- `phase-status.md`: POC, MVP-1, MVP-2 등 단계별 진행률과 남은 일을 추적한다.
- `execution-plan.md`: 단계별 실행 계획과 구현 순서 체크리스트를 관리한다.
- `progress-log.md`: 모든 작업 종료 시 누적 로그를 남긴다.
- `decision-log.md`: 설계/기술/범위 결정과 이유를 기록한다.
- `open-issues.md`: 막힌 점, 확인 필요사항, 리스크를 관리한다.
- `session-reports/`: 작업 단위별 상세 종료 보고서를 별도 파일로 저장한다.
- `templates.md`: 작업 종료 보고서 작성 양식이다.

## 작업 종료 시 필수 업데이트

작업 하나가 끝날 때마다 다음을 갱신한다.

1. `current-status.md`: 현재 상태, 완료/진행/다음 작업 갱신
2. `progress-log.md`: 날짜, 작업명, 변경 파일, 검증 결과 추가
3. `phase-status.md`: 해당 phase의 체크박스와 진행률 갱신
4. `decision-log.md`: 새 결정이 있으면 추가
5. `open-issues.md`: 새 이슈 또는 해결된 이슈 반영
6. `session-reports/YYYY-MM-DD-작업명.md`: 상세 종료 보고서 신규 생성
7. Graphify 그래프가 있는 경우 `nodesify-graphify update .` 실행

## 작성 원칙

- 결과만 쓰지 말고, 왜 그렇게 진행했는지까지 기록한다.
- 외부 API, 인증, rate limit, 실패 결과는 숨기지 않는다.
- 개발 완료와 검증 완료를 분리해서 표시한다.
- 미검증 기능은 `완료`로 적지 않는다.
- AI 요약, 특허 검색, 법률 판단 관련 기능은 evidence와 한계를 같이 기록한다.