# 앱

로컬 학습 화면과 API, PostgreSQL 초기화를 담당합니다.

| 경로 | 역할 |
| --- | --- |
| `writing_guide.py`, `writing_examples.json`, `frontend/writing-guide.js` | 읽기 전용 문항별 작성 틀·편집 예시와 자가 점검 |
| `main.py` | 문항·검수 이력·답안·시험지 API와 정적 파일 제공 |
| `db.py`, `schema.sql` | DB 연결, 스키마와 최초 콘텐츠 가져오기 |
| `frontend/study-layout.js` | 2열 배치·모바일 전환·문항 목록·메모 접기와 이전/다음 이동 |
| `frontend/upload-preview.js` | 등록 화면의 원본 PDF 표시·페이지 이동과 늦은 응답 격리 |
| `frontend/upload-draft.js` | 탭별 신규 등록 초안 보관·복구와 교체 확인 |
| `frontend/main.js`, `frontend/icons.js` | 학습·답안 저장·화면 전환과 접근성 이름을 가진 SVG 보조 버튼 |
| `frontend/draft-store.js` | 탭별 답안·메모 임시 글 보존, 복구 후보와 내려받기 |
| `frontend/retry-list.js`, `frontend/filter-chips.js` | 전체 다시 풀기 목록·메모 펼치기와 필터 표시·해제 |
| `frontend/learning.js`, `migrations/` | 답안 비교·복습 메모 및 개인 데이터의 추가형 이행 |
| `frontend/manage.js`, `frontend/review.js` | 문제·주제 검색과 상태별 문항 목록, 연속 검수·수정과 PDF 배율 |
| `static/` | HTML·CSS와 빌드된 assets(생성 파일) |

[실행·저장 정책과 다시 풀기 사용법](../docs/local-storage.md), [데이터 모델](../docs/data-model.md)을 따릅니다.
변경 후 [앱 통합 검사와 화면 확인](../docs/testing.md#앱-통합-검사)을 수행합니다.
