# 앱

로컬 학습 화면과 API, PostgreSQL 초기화를 담당합니다.

| 경로 | 역할 |
| --- | --- |
| `main.py` | 문항·답안·시험지 API와 정적 파일 제공 |
| `db.py`, `schema.sql` | DB 연결, 스키마와 최초 콘텐츠 가져오기 |
| `frontend/` | 화면 동작과 참고 답안 렌더링 소스 |
| `static/` | HTML·CSS와 빌드된 assets(생성 파일) |

[실행·저장 정책](../docs/local-storage.md), [데이터 모델](../docs/data-model.md)을 따릅니다.
변경 후 [앱 통합 검사와 화면 확인](../docs/testing.md#앱-통합-검사)을 수행합니다.
