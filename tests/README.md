# 검사

콘텐츠 보존과 앱 저장 동작의 회귀를 검사합니다.

| 경로 | 역할 |
| --- | --- |
| `test_data.py` | ID·연결·원본 보존과 생성 도구 검사 |
| `test_backup.py` | 백업 해시·경로·필수 항목 검사 |
| `test_app.py` | 실제 PostgreSQL API·문항 검수·답안 보존·추가형 이행 검사 |
| `review-ui.test.mjs` | 검수 핸들러의 연속 이동·저장 실패·목록 순서·PDF 배율 회귀 검사 |
| `study-layout.test.mjs` | 단계 전환 시 편집기·선택 범위·메모 유지 검사 |
| `learning-ui.test.mjs` | 답안 비교·메모 저장·임시 복구·충돌·참고 자료 전환 회귀 검사 |

준비 조건과 실행 명령은 [검증 안내](../docs/testing.md)를 따릅니다.
앱 검사는 전용 `peim_test` DB만 허용합니다. 실제 개인 DB로 실행하지 않습니다.
