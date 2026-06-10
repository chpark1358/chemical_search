# Phase 2 Chemical Search 웹 UI 작업 종료 보고서

날짜: 2026-06-10

## 목적

기존 월드컵 화면을 변경하지 않고 Chemical Search 전용 웹 작업공간과 FastAPI 연동 흐름을 구현한다.

## 완료 범위

- `/chemical` 전용 route와 metadata
- `/chemical-api` Next.js rewrite와 typed API client
- 검색 입력 유형, 검색 모드, 유사도 기준, provider 선택
- formula 후보 선택과 실행 상태 polling
- normalized compound, provider diagnostics, ranked result, evidence, partial 상태
- JSON/Markdown/CSV export UI

## 검증 결과

- Next.js lint/build: 통과
- Chemical Search Python 테스트: 14개 통과
- aspirin 실제 검색: 일부 provider 실패를 유지하며 결과 21건 표시
- `C9H8O4` 실제 검색: 후보 목록 표시, Aspirin 선택, 결과 표시
- 브라우저 콘솔: 경고/오류 없음

## 남은 작업

- Ketcher 구조 편집기 검증 및 통합
- 브라우저 회귀 테스트 자동화
- 검색 상태 영속 저장소 설계
