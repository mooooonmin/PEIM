# 콘텐츠 보존과 생성 과정

## 원본 이동

원본 내용은 변경하지 않고 다음 경로로 이동했습니다.
파일별 이전 경로·새 경로·SHA-256은 `data/preservation.json`에서 검사합니다.
기준 커밋은 해당 파일의 baseline_commit에 기록되어 있습니다.
PDF·HWP는 원시 바이트 SHA-256, 텍스트는 CRLF를 LF로 정규화한 SHA-256입니다.
Git의 Windows/Linux 체크아웃 줄바꿈 차이만 허용하며 실제 콘텐츠 변경은 검사에서 실패합니다.
각 파일의 hash_mode로 계산 방식을 명시합니다. 이번 이동 전후의 로컬 원시 바이트도 동일함을 확인했습니다.

| 이전 경로 | 현재 경로 |
| --- | --- |
| scripts/content/ | content/answers/ |
| scripts/contentwork/ | content/work/ |
| scripts/topicwork/ | content/topics/ |
| scripts/manual/ | content/manual/ |
| scripts/fixes.json | content/rules/fixes.json |
| scripts/merge_rules.json | content/rules/merge_rules.json |
| scripts/keyword_rules.json | content/rules/keyword_rules.json |

content 안의 기존 GUIDE 문서는 원본 보존을 위해 그대로 두었습니다.
그 안의 이전 절대 경로·scripts 경로는 역사적 기록이며 위 표와 현재 도구의 경로를 사용합니다.
content/work의 sec 파일 등 작업 자료도 삭제하지 않았습니다.

## 기준 데이터와 적용 순서

1. 시험지 원본 + content/manual의 수기 전사 + content/rules/fixes.json → 문항.
2. content/topics/topics 파일 + merge_rules.json → 주제와 문항 연결.
3. content/answers의 분야 묶음 → 주제별 파일 순서로 읽습니다. 주제별 파일이 우선합니다.
4. content/work/keywords 파일과 work/kw 파일을 병합하고 keyword_rules.json을 적용합니다.
5. content/overrides/keywords.json을 마지막으로 적용합니다.
6. 도식은 content/work/kwviz/out → fix 순서로 읽고 수정본을 우선합니다.
7. public/data의 분야별 답안·키워드·도식 분할 파일과 priority.json을 생성합니다.

content/work/kwviz/out은 이름이 out이어도 보존 대상인 도식 원본입니다.
삭제 가능한 생성 출력은 scripts/out에 한정하며 두 경로를 혼동하지 않습니다.

현재 public/data는 기존 학습 자료를 보존한 앱용 기준 데이터입니다.
변환 과정에서 발견한 separation-of-duty의 배포본과 원본 병합 결과 차이는
`content/overrides/keywords.json`에 배포본의 값을 그대로 기록하여 보존했습니다.
이는 기존 수정 의도를 추정하거나 학술적 정답으로 검증한 것이 아닙니다.
위 override의 출처는 기준 커밋의 `public/data/kw/s.json` 해당 키입니다.

## 검사와 재현

```powershell
python scripts/validate_data.py
python scripts/build_catalog.py --check
python scripts/check_rebuild.py
python -m unittest discover -s tests -v
python scripts/export_dataset.py
```

- validate_data: 중복 ID/JSON 키, 연결, 답안 누락, 키워드 링크, 분할 파일, 우선 학습 메타데이터,
  고정 ID, 원본 보존 해시 검사. 읽기 전용입니다.
- build_catalog --check: 버전 관리된 시험지의 경로·해시와 실제 파일 비교. 읽기 전용입니다.
  앱으로 추가된 정규 이름의 PDF는 기존 폴더에 함께 있을 수 있으며 seed에 자동 편입하지 않습니다.
- check_rebuild: 임시 복사본에서 주제 병합 → 답안·키워드·도식 생성 → 우선 학습 생성 후,
  public/data의 전체 파일 목록과 바이트 해시를 비교합니다. 실제 원본은 수정하지 않습니다.
- PDF/HWP를 다시 파싱하는 과정은 check_rebuild에 포함하지 않습니다.
  외부 추출 도구와 원문 대조가 필요하며, 현재 문항 JSON을 입력으로 사용합니다.
- PR CI는 위 명령과 검사 후 tracked diff가 없는지 확인합니다.
  워크플로 실행과 GitHub 보호 규칙의 필수 검사 등록은 서로 다릅니다.

기존 생성 스크립트를 직접 실행하면 파생 데이터가 덮어써집니다.
확인은 check_rebuild를 사용하고, 실제 갱신은 작업 브랜치에서 diff를 검토합니다.

## 새 자료 반영

1. 기존 시험지 폴더에 정규 이름으로 새 원본을 보관합니다. 기존 파일은 덮어쓰지 않습니다.
2. `python scripts/build_catalog.py`를 명시적으로 실행해 목록을 갱신하고 diff를 확인합니다.
3. 문항 추출·검토·주제 연결은 별도로 진행합니다. 회차만 먼저 추가해도 됩니다.
4. 새 콘텐츠·수정본을 정리하고 임시 재생성 결과를 검토합니다.
5. 파생 데이터의 의도된 변경은 보존 manifest의 새 기준을 PR에서 검토하여 갱신합니다.
   원본·기존 수정본은 유지하고 추가 수정은 override로 남깁니다. 검사를 통과시키기 위해
   누락 원본이나 변경 이유를 숨기는 해시 갱신을 하지 않습니다.
6. 기존 ID 삭제·병합은 별도 마이그레이션 기록 없이 허용하지 않습니다.

앱으로 추가하는 자료는 `시험지 관리` 화면에서 업로드·추출·확인합니다.
이 자료의 메타데이터와 문항은 DB에 저장되며 기존 public/data나 catalog를 직접 수정하지 않습니다.
새 PDF는 기본적으로 Git에서 제외합니다. 새 자료를 배포용 seed로 편입할 경우에는 별도 검토 후
명시적으로 파일을 추가하고 catalog와 콘텐츠를 갱신해야 합니다.
