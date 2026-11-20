# 앱

로컬 학습 화면과 API, PostgreSQL 초기화를 담당합니다.

| 경로 | 역할 |
| --- | --- |
| `writing_guide.py`, `writing_examples.json`, `frontend/writing-guide.js` | 읽기 전용 문항별 작성 틀·편집 예시와 자가 점검 |
| `main.py` | 문항·검수 이력·답안·시험지 API와 정적 파일 제공 |
| `db.py`, `schema.sql` | DB 연결, 스키마와 최초 콘텐츠 가져오기 |
| `frontend/study-layout.js` | 2열 배치·모바일 전환·문항 목록·메모 접기와 이전/다음 이동 |
| `frontend/main.js` | 학습·답안 저장과 화면 전환 |
| `frontend/learning.js`, `migrations/` | 답안 비교·복습 메모 및 개인 데이터의 추가형 이행 |
| `frontend/manage.js`, `frontend/review.js` | 문항 관리 목록, 연속 검수·수정과 PDF 배율 |
| `static/` | HTML·CSS와 빌드된 assets(생성 파일) |

[실행·저장 정책](../docs/local-storage.md), [데이터 모델](../docs/data-model.md)을 따릅니다.
변경 후 [앱 통합 검사와 화면 확인](../docs/testing.md#앱-통합-검사)을 수행합니다.

`frontend/retry-list.js`는 주제·회차를 넘는 전체 다시 풀기 목록과 검색·열기 상태를 담당합니다.
목록 사용법은 [로컬 사용 안내](../docs/local-storage.md#전체-다시-풀기-목록)를 참고하세요.
