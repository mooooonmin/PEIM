# PEIM

정보관리기술사 기출문항과 주제별 참고 답안을 이용하는 로컬 개인용 학습 앱입니다.
FastAPI 웹 서버와 PostgreSQL을 Docker로 실행합니다.

## 시작하기

Docker Desktop의 Linux 컨테이너 엔진이 필요합니다.
[실행 안내](docs/local-storage.md#실행)에 따라 서비스를 시작한 뒤
[학습 화면](http://localhost:8000)을 엽니다.

- 주제·회차 탐색, 문제 검색, 문항별 답안 자동 저장·이력 복원, 집중 모드
- 주제 참고 답안과 도식, 원본 시험지 열람
- 원본 대조, 기존 문항·연결 주제·페이지 수정, 검증 상태와 수정 이력
- 새 회차 PDF 첨부, 추출 초안 검토, 수동 문항·주제 등록

로컬 개인용 앱이며 로그인은 없습니다. 기존 시험지 폴더와 파일명 규칙을 유지합니다.
지원 범위와 데이터 보관 방법은 [운영·백업·복원 안내](docs/local-storage.md)를 참고하세요.
개발 시 필요한 도구와 검사·빌드 명령은 [검증 안내](docs/testing.md)에 있습니다.

## 구성

| 경로 | 역할 |
| --- | --- |
| `정보관리기술사_기출문제/` | 기존 PDF·HWP와 수집 기록. 새 PDF도 같은 폴더에 저장 |
| [content/](content/README.md) | 답안·키워드·도식 원본, 수정본, 분류 규칙, 수기 전사, 작업 가이드 |
| `public/data/` | 기존 앱용 JSON. 보존 검사의 대상 |
| [data/](data/README.md) | 원본 목록, 보존 해시, 기존 ID 목록 |
| [scripts/](scripts/README.md) | 변환·검사·내보내기 도구 |
| [tests/](tests/README.md) | 데이터·백업 검사와 PostgreSQL 앱 통합 검사 |
| [app/](app/README.md) | API, DB 스키마·가져오기, 학습·시험지 관리 화면 |

- [데이터 모델과 식별자](docs/data-model.md)
- [콘텐츠 원본·수정본·생성 과정](docs/content-pipeline.md)
- [로컬 실행·PDF 첨부·백업과 복원](docs/local-storage.md)

수정 후 검증·커밋·PR·병합 절차는 [AGENTS.md](AGENTS.md)를 따릅니다.
