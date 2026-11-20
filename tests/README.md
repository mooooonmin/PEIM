# 검사

콘텐츠 보존과 앱 저장 동작의 회귀를 검사합니다.

| 경로 | 역할 |
| --- | --- |
| `test_data.py` | ID·연결·원본 보존과 생성 도구 검사 |
| `test_backup.py` | 백업 해시·경로·중단 후 재시도·원본 덮어쓰기 방지 검사 |
| `test_app.py` | 실제 PostgreSQL API·문항 검수·답안 보존·추가형 이행 검사 |
| `review-ui.test.mjs` | 검수 핸들러의 연속 이동·저장 실패·목록 순서·PDF 배율 회귀 검사 |
| `upload-preview.test.mjs` | PDF 선택 경합·페이지·확대 초기화·실패 복구 |
| `study-recovery.test.mjs`, `helpers/` | 지연·실패 응답의 복구 및 문항·자료 연결 보존 |
| `study-save.test.mjs` | 메인 화면의 문항·빈 회차 응답 대기 중 답안 저장과 실패 시 이동 중단 |
| `study-layout.test.mjs` | 2열 전환·접기 시 편집기·메모 유지와 연속 문항 이동 검사 |
| `learning-ui.test.mjs` | 답안 비교·메모 저장·임시 복구·충돌·참고 자료 전환 회귀 검사 |
| `draft-store.test.mjs`, `retry-list.test.mjs` | 탭 간 임시 글 보존·복구와 전체 다시 풀기 목록 |
| `test_writing_guide.py`, `writing-guide.test.mjs` | 문항 요구사항별 작성 가이드·예시와 읽기 전용 UI |

준비 조건과 실행 명령은 [검증 안내](../docs/testing.md)를 따릅니다.
앱 검사는 전용 `peim_test` DB만 허용합니다. 실제 개인 DB로 실행하지 않습니다.
