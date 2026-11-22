# 데이터 모델과 DB 이행

초기 콘텐츠 계약은 v1이며 로컬 DB 스키마에는 v2 문항 수정 이력과 v3 복습 정보가 추가됩니다. 기본 테이블은 `app/schema.sql`, 추가 이행은 `app/migrations/`,
트랜잭션 초기화·가져오기는 `app/db.py`에 있습니다. 참조 키·관계는 관계형 테이블에,
출처와 검증 부가 정보는 각 테이블의 JSONB data에 저장합니다.

## 객체와 관계

| 객체 | 키와 주요 필드 | 관계·제약 |
| --- | --- | --- |
| exam | `id`, `round`, `exam_date`, `status` | 회차 양의 정수·유일. 현재 수록 회차에 고정하지 않으며 DB integer 및 업로드 API 범위 내에서 추가 |
| attachment | `id`, `exam_id`, `path`, `format`, `sha256`, `original_filename`, `page_count`, `verification_status` | 회차에 여러 원본 형식 연결 가능. 현재 PDF·HWP 보존, 신규 UI는 PDF |
| domain | `code`, `name`, `description` | 분야 코드 유일 |
| topic | `id`, `title`, `title_en`, `domain`, `aliases` | 현재 주 분야 하나. ID는 표시 제목과 별개로 보존 |
| question | `id`, `exam_id`, `round`, `session`, `number`, `text`, `verification_status` | 회차·교시·문항번호 조합 유일. 교시는 1~4 |
| question_source | `question_id`, `attachment_id`, `page_start`, `page_end`, `association_basis`, `verification_status` | 복합키 유일. 페이지는 확인 전 null, 확인 후 1부터 시작 |
| question_topic | `question_id`, `topic_id` | 복합키 유일. 여러 주제 연결을 허용 |
| reference_answer | `id`, `topic_id`, `variant`, `body`, `revision`, `source_path`, `source_pointer`, `citations`, `verification_status` | 주제별 참고 답안. variant는 short/long. 공식 정답이 아님 |
| keyword | `id`, `term`, `term_en`, `definition`, `features`, `related`, `visual`, `verification_status` | 관련 키워드와 도식 참조 보존 |
| topic_keyword | `topic_id`, `keyword_id` | 복합키 유일 |
| user_answers | `profile_id`, `question_id`, `body`, `status`, `revision`, `created_at`, `updated_at` | 프로필·문항 복합 기본키. 상태는 draft/completed |
| answer_revisions | `profile_id`, `question_id`, `revision`, `body`, `status`, `saved_at` | 프로필·문항·리비전 복합 기본키. 복원용 이력 |
| learning_notes | `profile_id`, `question_id`, `note`, `retry_requested`, `revision`, `updated_at` | 프로필·문항별 보완 메모와 다시 풀기. 답안·검수 상태와 독립 |

단일 사용자 초기 버전은 로컬 기본 프로필 하나를 사용하며 로그인은 구현 범위에서 제외합니다.
이는 접근 인증을 제공한다는 뜻이 아닙니다. 다중 사용자 확장 시 인증·권한은 별도 구현합니다.
콘텐츠 가져오기 파일에는 user_answer를 넣지 않습니다. 가져오기로 개인 답안을 지우거나 덮어쓰면 안 됩니다.

## 식별자와 변경

- 기존 ID는 `data/stable_ids.json`에 기록했으며 누락을 검사합니다.
- 기존 문항 ID `r{회차}-s{교시}-q{두 자리 문항번호}`를 유지합니다.
- 기존 주제 ID `t-...`를 유지합니다. `merge_topics.py`는 기존 문항 연결로 ID를 먼저 찾으므로
  제목을 변경해도 기존 주제 ID를 다시 해시하지 않습니다.
- 초기 콘텐츠 생성기는 신규 주제만 해시를 생성하며 기존 ID와 충돌하면 중단합니다.
  앱에서 추가하는 주제는 `t-` 접두사와 UUID로 ID를 생성합니다.
- 기존 주제끼리의 병합, 하나의 기존 주제 분할, 문항번호 정정은 명시적인 이전 계획이 필요합니다.
  생성기가 임의로 ID를 교체하지 않습니다. DB 도입 후에는 참조 이전과 이력 보존을 한 트랜잭션으로 처리합니다.
- 기존 문항이 없는 완전히 새로운 주제는 새 객체입니다. 이름이 같다는 이유만으로 기존 ID를 재사용하지 않습니다.

## 출처와 검증 상태

출처 연결과 내용 검증은 서로 다릅니다.

- `data/catalog.json`의 연결은 파일명 회차를 근거로 합니다. PDF/HWP 본문을 대조한 결과가 아닙니다.
- export의 question_sources는 `association_basis: round_filename`과 `unverified`로 내보냅니다.
- 초기 가져오기 자료의 시험일, 페이지 수, 문항별 페이지, 원래 업로드 이름은 확인되지 않아 null입니다.
  앱 업로드·추출·검수에서 확인한 정보는 로컬 DB에 별도로 기록합니다.
- 참고 답안의 source_path와 source_pointer는 기존 데이터 내 위치입니다. 학술적 근거는 아닙니다.
  citations는 확인한 출처가 없어 빈 배열로 시작합니다.
- 문항 검증 상태는 `unverified`, `verified`, `needs_review`로 관리하고,
  verified로 바꿀 때 검토자·검토일·근거를 함께 저장합니다.
- 원본 수집 날짜나 실제 업로드 날짜를 임의로 생성하지 않습니다.

## 등록 상태와 학습 공개

PDF 업로드로 처음 등록한 회차의 상태는 `draft`로 시작하며, 기존 회차에 첨부하면 기존 상태를 유지합니다.
추출 성공은 검증 완료를 뜻하지 않습니다.
원문 확인 표시·본문·주제·원본 연결을 검증하여 첫 문항을 등록할 때, 같은 트랜잭션에서 `draft` 회차를 `published`로 전환합니다.
별도의 회차 공개 API나 전체 문항 검수 완료 단계는 없습니다. `published`는 회차 전체의 검증 완료를 뜻하지 않습니다.
추출 실패는 별도 처리 상태와 오류로 기록하여 파일을 보존합니다.
기존 가져오기 회차의 DB 상태는 `imported_unverified`로 유지합니다. 시험지 목록에서는 `published`와 함께
`학습 자료`로 표시하고, 학습 화면의 원문 확인 안내는 개별 문항의 검증 상태를 따릅니다.
새 회차는 문항 없이도 등록할 수 있습니다.

현재 public/data 검사는 기존 학습 데이터에 답안·주제 연결이 모두 있다는 기준으로 엄격하게 검사합니다.
DB의 업로드 초안에는 이 완성도 규칙을 적용하지 않고, 문항 등록 API에서 필수 항목을 검사합니다.
새 주제에 참고 답안이 없어도 문항 등록과 내 답안 작성은 가능합니다.

## 내보내기와 DB 가져오기 계약

`python scripts/export_dataset.py`는 검증 성공 후 schema_version 1의 JSON을 생성합니다.
같은 입력에서는 날짜나 난수를 넣지 않아 같은 결과가 나옵니다.
본문·키워드·도식·우선 학습 목록을 보존하면서 관계 목록을 분리합니다.

가져오기는 schema_version을 검사하고, 외래키 대상부터 트랜잭션 안에서 등록합니다.
imports의 버전으로 최초 가져오기만 수행하며, 앱 재시작으로 개인 답안과 검토 상태를 초기화하지 않습니다.
동일한 버전의 seed를 수정해도 이미 가져온 DB는 자동 갱신되지 않습니다. 이후 배포 데이터 갱신은
새 가져오기 버전과 명시적 마이그레이션으로 구현해야 합니다. 런타임 PDF·문항 추가는 API와 DB로 관리합니다.
원본 PDF·HWP는 JSON에 복사하지 않고 상대 경로와 해시로 연결합니다.

문항별 자동 저장은 DB 성공 응답 뒤에만 ‘저장됨’을 표시합니다.
저장 실패 시 편집 내용을 유지하고 재시도하며, revision을 비교해 여러 창의 덮어쓰기를 감지합니다.
브라우저 임시 보관은 보조 수단이며 DB 저장을 대신하지 않습니다. 충돌 시 내 글 다운로드와
서버 답안 불러오기를 제공합니다. 최근 저장 이력을 선택해 복원하면 새로운 revision으로 저장합니다.

## 문항 검수 이력 (DB v2)

`question_revisions`는 `(question_id, revision)`을 기본키로 사용하고,
`before_data`, `after_data`, `reviewer`, `saved_at`을 저장합니다. 전후 스냅샷에는
문제 내용, 검증 메타데이터, 연결 주제 ID·제목, 원본별 페이지와 상태가 포함됩니다.
최초 수정에도 기존 내용이 before_data로 남습니다. 답안 이력과 별개이며 목록은 최근 50개를 반환합니다.

문항의 JSONB data에 `review_revision`을 저장하며 없는 기존 문항은 0으로 취급합니다.
`PUT /api/questions/{qid}/review`는 문항 행을 잠그고 전달 revision을 비교합니다.
충돌은 409로 거절합니다. 문항·주제 연결·출처 페이지·이력 저장은 한 트랜잭션이며,
문항 ID·회차·교시·번호·user_answers·answer_revisions는 변경하지 않습니다.
`GET /api/questions/{qid}/reviews`는 저장된 변경 이력을 반환합니다.

검증 상태는 문항 내용의 사용자 확인과 출처 페이지의 확인을 구분합니다.
페이지가 없는 출처는 unverified이며, 입력된 페이지는 실제 PDF 범위와 해시를 검사합니다.
출처 연결을 추가·삭제하거나 문항 번호를 정정하는 기능은 이번 수정 API에 포함하지 않습니다.

앱 시작 시 기존 초기화 잠금·트랜잭션 안에서 이력 테이블을 추가하고 schema_version에 2를 기록합니다.
기존 테이블·문항·개인 답안을 지우거나 seed를 다시 가져오지 않는 추가형 이행입니다.
DB 업데이트 전 백업은 [운영 안내](local-storage.md#백업과-복원)를 따릅니다.

## 복습 정보 추가형 이행 (v3)

`app/migrations/003_learning.sql`은 기존 답안·답안 이력·문항을 변경하지 않고 `learning_notes`를 추가합니다.
앱 초기화가 기본 스키마 다음에 정렬된 이행 파일을 실행하며 반복 실행해도 개인 데이터를 초기화하지 않습니다.
이행 파일은 배포 후 수정하지 않고 후속 파일로 확장합니다. 이전 앱으로 되돌릴 때도 이 테이블과 메모는 보존하며
자동 역이행·테이블 삭제는 제공하지 않습니다. 필요하면 백업을 확인한 후 별도 복구 작업으로 처리합니다.

`GET/PUT /api/questions/{qid}/learning`은 로컬 프로필의 복습 정보만 조회·변경합니다. 최초 revision은 0이고,
저장마다 증가합니다. 문항 행 잠금과 revision 대조로 다른 창의 수정을 덮어쓰지 않습니다(불일치 409).
메모는 30,000자 이하이며 다시 풀기는 boolean입니다. 메모 저장은 답안 버전과 `answer_revisions`에 영향을 주지 않습니다.
`GET /api/questions`의 `retry_requested`는 저장된 표시만 반환합니다. 복습 정보는 초기 콘텐츠 내보내기에 포함하지 않습니다.

전체 다시 풀기 목록은 `GET /api/retry-questions`로 현재 로컬 프로필의 `retry_requested=true`인 문항을 조회합니다.
문항·회차·주제·답안 상태와 저장된 보완 메모를 결합하며 읽기만 수행합니다. 추가 테이블이나 스키마 이행은 없습니다.


## 문항별 작성 가이드

`GET /api/questions/{qid}/writing-guide`는 읽기 전용입니다. DB 테이블·마이그레이션을 추가하지 않습니다.
`app/writing_guide.py`는 현재 문항에서 요구사항·목차·검토할 주제 후보·자가 점검 초안을 만듭니다.
`app/writing_examples.json`은 문항 ID별로 question_text, outline, keywords, checklist, example,
source_topic_ids, provenance, revision을 가진 별도 편집 자료입니다. 기존 reference_answers와 개인 데이터는 수정하지 않습니다.
공백을 제외한 현재 원문이 question_text와 일치할 때만 예시를 반환하며, 불일치하면 scaffold로 반환합니다.
kind=example은 편집 자료가 있다는 뜻이며 공식 정답·학술적 검증 상태가 아닙니다.
kind=scaffold는 예시 미등록 상태이며 example=null입니다. 자동 생성 결과는 초안으로 표시합니다.

목차·힌트는 요구 문구에 따라 비교·계산·설계·절차·개념형으로 구성합니다. 복합 문항은
가·나·다 순서를 유지하고 각 항목에 해당하는 힌트를 제공합니다. 공식 유형 판정은 아닙니다.

`GET /api/topics/{tid}/reference`의 각 답안은 기존 variant/body와 함께 `editorial_status`를 반환합니다.
`format_only`는 형식 정리만, `corrected`는 원문 해시가 일치하는 편집본 적용,
`source_mismatch`는 교정 대상이지만 원문이 달라 형식만 정리한 상태입니다.
이 상태는 DB의 학술적 verification_status와 별개이며 전체 검증을 뜻하지 않습니다.
편집본 적용과 보존 정책은 [콘텐츠 파이프라인](content-pipeline.md#학습-화면의-편집본)을 따릅니다.
