# PEIM

정보관리기술사 기출문항과 주제별 참고 답안을 이용하는 로컬 학습 앱의 데이터 기반입니다.
현재는 데이터·변환 도구·검사만 있으며, 웹 화면·DB 실행·PDF 업로드 UI는 아직 구현하지 않았습니다.

## 데이터 검사

Python 3.11 이상, 외부 Python 패키지 없이 실행합니다.

```powershell
python scripts/validate_data.py
python scripts/build_catalog.py --check
python -m unittest discover -s tests -v
python scripts/check_rebuild.py
python scripts/export_dataset.py
```

검사 명령은 원본을 수정하지 않습니다. export는 Git에서 제외된
`scripts/out/dataset-v1.json`에 DB 가져오기용 정규화 데이터를 생성합니다.
자동 검사 성공은 콘텐츠의 학술적 정확성이나 시험지 원문 대조 완료를 뜻하지 않습니다.

## 구성

| 경로 | 역할 |
| --- | --- |
| `정보관리기술사_기출문제/` | 기존 PDF·HWP와 수집 기록. 새 PDF도 같은 폴더에 저장 |
| `content/` | 답안·키워드·도식 원본, 수정본, 분류 규칙, 수기 전사, 작업 가이드 |
| `public/data/` | 기존 앱용 JSON. 이번 정리에서는 바이트 그대로 보존 |
| `data/` | 원본 목록, 보존 해시, 기존 ID 목록 |
| `scripts/` | 변환·검사·내보내기 도구 |
| `tests/` | 무결성 검사와 식별자 정책의 회귀 테스트 |

- [데이터 모델과 식별자](docs/data-model.md)
- [콘텐츠 원본·수정본·생성 과정](docs/content-pipeline.md)
- [로컬 실행과 PDF 첨부 요구사항](docs/local-storage.md)

수정 후 검증·커밋·PR·병합 절차는 [AGENTS.md](AGENTS.md)를 따릅니다.
