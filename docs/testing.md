# 개발 검사와 빌드

모든 명령은 프로젝트 루트에서 실행합니다. 작업별 결과는 커밋과 PR에 기록합니다.
검사 통과는 학습 콘텐츠의 학술적 정확성이나 원문 대조 완료를 뜻하지 않습니다.
이전 앱 구현의 검증 기록은 [PR #5](https://github.com/mooooonmin/PEIM/pull/5)에 남아 있습니다.

## 데이터 검사와 내보내기

호스트 Python 3.11 이상이 필요하며 아래 명령에는 외부 Python 패키지가 필요하지 않습니다.

```powershell
python scripts/validate_data.py
python scripts/build_catalog.py --check
python -m unittest discover -s tests -v
python scripts/check_rebuild.py
python scripts/export_dataset.py
```

원본을 수정하지 않고 관계·원본 해시·식별자·답안 범위와 재생성 일치를 검사합니다.
`check_rebuild.py`는 임시 복사본을 사용합니다. 내보내기는 Git에서 제외된
`scripts/out/dataset-v1.json`을 생성합니다. 생성 순서·검사 범위와 실제 데이터 갱신은
[콘텐츠 파이프라인](content-pipeline.md)을 참고하세요.

호스트 unittest는 데이터·백업 검사를 실행하고 앱 통합 검사는 건너뜁니다.
앱 테스트는 아래 Docker 명령으로 실행해야 합니다.

## 앱 통합 검사

Docker Desktop의 Linux 컨테이너 엔진을 실행한 상태에서 사용합니다.

```powershell
docker compose config --quiet
docker compose --profile test run --build --rm test
```

별도 `peim_test` PostgreSQL과 임시 시험지 폴더를 사용합니다. 실제 답안 DB와 원본 폴더를
사용하지 않습니다. API 저장·충돌·이력, PDF 등록·추출·문항 등록을 검사합니다.
웹 실행 방법과 데이터 보존은 [운영 안내](local-storage.md)에서 확인합니다.

## 프런트엔드 빌드

Node.js와 npm이 필요합니다. Docker 빌드의 Node 버전 기준은 [Dockerfile](../Dockerfile)입니다.

```powershell
npm ci
npm run build
```

출력은 Git에서 제외된 `app/static/assets/`입니다. Docker 웹 이미지 빌드에도 이 과정이 포함됩니다.
화면 동작 변경 시 브라우저에서 해당 흐름과 저장 상태를 확인하고 PR에 범위·결과를 기록합니다.

## 문서 변경과 PR 검사

문서만 바꿀 때는 변경한 설명을 실제 코드·경로와 대조하고 상대 링크와 아래 검사를 확인합니다.
동작 변경이 없으면 앱 통합 검사를 로컬에서 다시 실행할 필요는 없으며 미실행 이유를 기록합니다.

```powershell
git diff --check
```

PR에서는 [데이터 검사](../.github/workflows/data-checks.yml)와
[앱 검사](../.github/workflows/app-checks.yml)가 실행됩니다.
CI 실행 여부와 보호 규칙의 필수 검사 등록은 서로 다릅니다. 실제 결과를 확인한 뒤 병합합니다.
