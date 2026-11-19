# PEIM

정보관리기술사 기출문항과 주제별 참고 답안을 이용하는 로컬 개인용 학습 앱입니다.
FastAPI 웹 서버와 PostgreSQL을 Docker로 실행합니다.

## 실행

Docker Desktop의 Linux 컨테이너 엔진을 켠 뒤 프로젝트 폴더에서 실행합니다.

```powershell
docker compose up -d --build --wait web
```

[학습 화면 열기](http://localhost:8000). 최초 실행 시 기존 데이터를 DB에 가져오며,
이후 재시작·재빌드는 개인 답안을 초기화하지 않습니다. 종료는 `docker compose stop`입니다.

- 주제·회차 탐색, 문제 검색, 문항별 자동 저장, 저장 이력 복원, 작성 완료 표시, 집중 모드
- 주제 참고 답안의 Markdown 표·도식 표시와 원본 시험지 열기
- 시험지 관리에서 PDF 첨부, 텍스트 추출 초안, 원문 대조 후 문항 등록, 새 주제 추가
- PDF는 기존 `정보관리기술사_기출문제/`에 `제{회차}회_정보관리기술사.pdf`로 저장
- DB는 Docker 영속 볼륨에 저장. 같은 회차의 다른 PDF와 같은 번호의 기존 문항은 덮어쓰지 않음

웹은 `127.0.0.1`에만 공개하며 로그인은 없습니다. DB 포트는 호스트에 공개하지 않습니다.
운영·백업·복원과 지원 범위는 [로컬 실행 안내](docs/local-storage.md)를 참고하세요.

## 앱 검사

```powershell
docker compose --profile test run --build --rm test
```

실제 PostgreSQL의 별도 `peim_test` DB와 임시 시험지 폴더를 사용합니다.
일반 `python -m unittest discover -s tests -v`에서는 앱 통합 검사를 건너뜁니다.
프런트엔드를 별도로 빌드하려면 Node.js 환경에서 `npm ci`와 `npm run build`를 실행합니다.

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
| `app/` | API, DB 스키마·가져오기, 학습·시험지 관리 화면 |

- [데이터 모델과 식별자](docs/data-model.md)
- [콘텐츠 원본·수정본·생성 과정](docs/content-pipeline.md)
- [로컬 실행과 PDF 첨부 요구사항](docs/local-storage.md)

수정 후 검증·커밋·PR·병합 절차는 [AGENTS.md](AGENTS.md)를 따릅니다.
