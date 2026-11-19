# 데이터·운영 도구

콘텐츠 변환·검사·내보내기와 로컬 백업을 담당합니다. 콘텐츠 원본은 `content/`에 있습니다.

| 경로 | 역할 |
| --- | --- |
| `data_contract.py`, `build_catalog.py` | 식별자·시험지 이름 계약과 원본 목록 |
| `validate_data.py`, `check_rebuild.py`, `find_orphans.py` | 무결성·재생성·연결 진단 |
| `parse_questions.py`, `merge_topics.py` | 문항 파싱과 주제 병합 |
| `build_content.py`, `build_priority.py` | 콘텐츠·우선 학습 데이터 생성 |
| `export_dataset.py` | DB 가져오기용 데이터 출력 |
| `backup.py` | DB·시험지 백업과 복원 |
| `out/` | Git에서 제외된 생성 출력 |

[생성·보존 정책](../docs/content-pipeline.md)과 [백업 절차](../docs/local-storage.md#백업과-복원)를 따릅니다.
변경 후 [데이터 검사](../docs/testing.md#데이터-검사와-내보내기)를 수행합니다.
