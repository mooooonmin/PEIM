# 데이터 모델 v1

이 문서는 다음 웹·DB 구현의 데이터 계약입니다. 현재 구현은 원본 목록 생성,
읽기 전용 검사, 정규화 JSON 내보내기까지입니다. DB 테이블·마이그레이션·가져오기 API는 아직 없습니다.

## 객체와 관계

| 객체 | 키와 주요 필드 | 관계·제약 |
| --- | --- | --- |
| exam | `id`, `round`, `exam_date`, `status` | 회차 양의 정수·유일. 회차 증가에 상한을 두지 않음 |
| attachment | `id`, `exam_id`, `path`, `format`, `sha256`, `original_filename`, `page_count`, `verification_status` | 회차에 여러 원본 형식 연결 가능. 현재 PDF·HWP 보존, 신규 UI는 PDF |
| domain | `code`, `name`, `description` | 분야 코드 유일 |
| topic | `id`, `title`, `title_en`, `domain`, `aliases` | 현재 주 분야 하나. ID는 표시 제목과 별개로 보존 |
| question | `id`, `exam_id`, `round`, `session`, `number`, `text`, `verification_status` | 회차·교시·문항번호 조합 유일. 교시는 1~4 |
| question_source | `question_id`, `attachment_id`, `page_start`, `page_end`, `association_basis`, `verification_status` | 복합키 유일. 페이지는 확인 전 null, 확인 후 1부터 시작 |
| question_topic | `question_id`, `topic_id`, `verification_status` | 복합키 유일. 여러 주제 연결을 허용 |
| reference_answer | `id`, `topic_id`, `variant`, `body`, `revision`, `source_path`, `source_pointer`, `citations`, `verification_status` | 주제별 참고 답안. variant는 short/long. 공식 정답이 아님 |
| keyword | `id`, `term`, `term_en`, `definition`, `features`, `related`, `visual`, `verification_status` | 관련 키워드와 도식 참조 보존 |
| topic_keyword | `topic_id`, `keyword_id` | 복합키 유일 |
| user_answer (향후 DB) | `id`, `profile_id`, `question_id`, `body`, `status`, `revision`, `created_at`, `updated_at` | 프로필·문항 조합 유일. 상태는 draft/completed |
| user_answer_revision (향후 DB) | `answer_id`, `revision`, `body`, `saved_at` | 답안·리비전 조합 유일. 복원용 이력 |

단일 사용자 초기 버전은 로컬 기본 프로필 하나를 사용하며 로그인은 구현 범위에서 제외합니다.
이는 접근 인증을 제공한다는 뜻이 아닙니다. 다중 사용자 확장 시 인증·권한은 별도 구현합니다.
콘텐츠 가져오기 파일에는 user_answer를 넣지 않습니다. 가져오기로 개인 답안을 지우거나 덮어쓰면 안 됩니다.

## 식별자와 변경

- 기존 ID는 `data/stable_ids.json`에 기록했으며 누락을 검사합니다.
- 기존 문항 ID `r{회차}-s{교시}-q{두 자리 문항번호}`를 유지합니다.
- 기존 주제 ID `t-...`를 유지합니다. `merge_topics.py`는 기존 문항 연결로 ID를 먼저 찾으므로
  제목을 변경해도 기존 주제 ID를 다시 해시하지 않습니다.
- 신규 주제만 기존 방식의 해시를 생성하며 기존 ID와 충돌하면 중단합니다.
- 기존 주제끼리의 병합, 하나의 기존 주제 분할, 문항번호 정정은 명시적인 이전 계획이 필요합니다.
  생성기가 임의로 ID를 교체하지 않습니다. DB 도입 후에는 참조 이전과 이력 보존을 한 트랜잭션으로 처리합니다.
- 기존 문항이 없는 완전히 새로운 주제는 새 객체입니다. 이름이 같다는 이유만으로 기존 ID를 재사용하지 않습니다.

## 출처와 검증 상태

출처 연결과 내용 검증은 서로 다릅니다.

- `data/catalog.json`의 연결은 파일명 회차를 근거로 합니다. PDF/HWP 본문을 대조한 결과가 아닙니다.
- export의 question_sources는 `association_basis: round_filename`과 `unverified`로 내보냅니다.
- 시험일, 페이지 수, 문항별 페이지, 실제 업로드 원래 이름은 확인되지 않아 null입니다.
- 참고 답안의 source_path와 source_pointer는 기존 데이터 내 위치입니다. 학술적 근거는 아닙니다.
  citations는 확인한 출처가 없어 빈 배열로 시작합니다.
- 향후 검증 상태는 `unverified`, `verified`, `needs_review`로 관리하고,
  verified로 바꿀 때 검토자·검토일·근거를 함께 저장합니다.
- 원본 수집 날짜나 실제 업로드 날짜를 임의로 생성하지 않습니다.

## 등록 상태와 학습 공개

신규 업로드의 회차 상태는 `draft`로 시작합니다. 추출 성공은 검증 완료를 뜻하지 않습니다.
검토 후 `published`로 전환하고, 추출 실패는 별도 처리 상태와 오류로 기록하여 파일을 보존합니다.
기존 회차는 `imported_unverified`로 유지합니다. 향후 앱은 기존 자료임을 표시하여 학습에 사용할 수 있지만
검증 완료 자료로 표시하지 않습니다. 새 회차는 문항 없이도 등록할 수 있습니다.

현재 public/data 검사는 기존 학습 데이터에 답안·주제 연결이 모두 있다는 기준으로 엄격하게 검사합니다.
DB의 업로드 초안에는 이 완성도 규칙을 적용하지 않고, 공개 시 필수 항목을 검사합니다.

## 내보내기와 DB 가져오기 계약

`python scripts/export_dataset.py`는 검증 성공 후 schema_version 1의 JSON을 생성합니다.
같은 입력에서는 날짜나 난수를 넣지 않아 같은 결과가 나옵니다.
본문·키워드·도식·우선 학습 목록을 보존하면서 관계 목록을 분리합니다.

향후 importer는 schema_version을 검사하고, 외래키 대상부터 트랜잭션 안에서 등록합니다.
같은 ID를 재등록해도 중복 생성하지 않는 방식으로 구현하며, 개인 답안과 검토 상태는 seed로 초기화하지 않습니다.
원본 PDF·HWP는 JSON에 복사하지 않고 상대 경로와 해시로 연결합니다.

문항별 자동 저장은 DB 성공 응답 뒤에만 ‘저장됨’을 표시합니다.
저장 실패 시 편집 내용을 유지하고 재시도하며, revision을 비교해 여러 창의 덮어쓰기를 감지하도록 구현합니다.
