# 참고 답안 순차 검수

## 목표와 범위

주제별 short/long을 공식 표준·제품 문서·표준기관 자료와 대조한다.
원본과 개인 답안·이력은 유지하고 `app/reference_edits.json`의 해시 일치 편집본으로 적용한다.
교정 범위·출처·검토일을 기록한다. 모든 주제의 단답형·서술형 전문을 읽고 근거를 대조하되,
원문에 접근할 수 없거나 근거가 부족한 주장은 `unresolved`에 구체적으로 남긴다.
전수 열람·검토와 모든 주장 검증을 구분하며 공식 채점 답안으로 표시하지 않는다.

## 작업 단위와 완료 조건

관련 주제를 묶어 읽기 → 출처 대조 → 교정 → 원본 해시·API·개인 기록 보존 검사 →
자체/별도 리뷰 → 단위별 커밋·푸시·PR·CI·병합 순서로 진행한다.
검사 절차는 [개발 검사](../../testing.md), 편집본 계약은 [콘텐츠 파이프라인](../../content-pipeline.md)을 따른다.
결과 로그를 누적하지 않고 해당 PR에 검증 근거를 기록한다.

완료 조건은 전체 1,238개 주제·2,476개 답안의 누락 없는 검토, 오류 교정 및 근거·미확인 항목 기록,
원본·개인 기록 보존 검사와 단위별 PR 병합이다. 미확인 항목이 남으면 그 수와 내용을 별도로 보고한다.
메타데이터를 자동 복제하는 작업이나 출처 링크만 추가한 작업은 검수로 세지 않는다.

## 현재 상태와 다음 순서

- 이전 교정: 정규화·RAG·트랜잭션 격리 수준(PR #38). 제한된 주장 대조이며 전수 검수 완료가 아니다.
- SQL 인젝션·XSS: 예방 원칙·분류 교정, [PR #39](https://github.com/mooooonmin/PEIM/pull/39) 병합.
- IPv6·서브네팅: 주소·보안·계산 조건과 예외 교정. 단위별 검증·원격 반영 결과는 해당 PR 참조.
- 암호 기초 8개 주제와 범위 표시: [PR #41](https://github.com/mooooonmin/PEIM/pull/41) 병합. 운용 모드·암호 분류 등 9개 주제는 [PR #42](https://github.com/mooooonmin/PEIM/pull/42) 병합.
- 서명·PKI·웹 인증/전송 9개 주제: [PR #43](https://github.com/mooooonmin/PEIM/pull/43) 병합.
- IPsec·VPN·WLAN·IDS·DDoS·ARP 스푸핑 6개 주제: [PR #44](https://github.com/mooooonmin/PEIM/pull/44) 병합.
- DB 89개 주제: [PR #45](https://github.com/mooooonmin/PEIM/pull/45) 병합. CA 96개 주제 [PR #46](https://github.com/mooooonmin/PEIM/pull/46) 병합, DS·SE·NW 후속 대조 진행.
- 접근제어·인증 8개 주제 [PR #47](https://github.com/mooooonmin/PEIM/pull/47) 병합. RBAC·BLP·PAM·특권 비밀번호 관리 4개 주제 [PR #48](https://github.com/mooooonmin/PEIM/pull/48) 병합.
- 포렌식 관련 6개 주제 [PR #49](https://github.com/mooooonmin/PEIM/pull/49) 병합.
- 네트워크 103개 주제 [PR #50](https://github.com/mooooonmin/PEIM/pull/50) 병합. DS·SE·NEW는 후속 대조 진행.
- 위협·악성코드 관련 6개 주제 [PR #51](https://github.com/mooooonmin/PEIM/pull/51) 병합.
- 정보 탈취·스파이웨어·크라임웨어 3개 주제 [PR #52](https://github.com/mooooonmin/PEIM/pull/52) 병합.
- BPFdoor·미라이·스턱스넷 3개 주제 [PR #53](https://github.com/mooooonmin/PEIM/pull/53) 병합.
- Meltdown·Spectre·TOCTOU 3개 주제 [PR #54](https://github.com/mooooonmin/PEIM/pull/54) 병합.
- 인젝션·포맷 스트링·개발보안 관련 7개 주제 [PR #55](https://github.com/mooooonmin/PEIM/pull/55) 병합. 이전 SQL 인젝션·XSS 편집본도 전문 대조 범위로 확대.
- SIEM·SOAR·TTPs·패치관리 4개 주제 전문 검토·교정 통합 중.
- 전체 검수 진행: NW·DB·CA는 독립된 분야별 대조, SEC는 암호 기초부터 대조한다.
- 이후 SE·DS·MGT·NEW까지 계속 진행하며 기존 7개 편집 주제도 전문 검토 범위에 포함한다.

전체 대상은 `public/data/topics.json`의 ID와 원본 short/long으로 대조한다.
편집본이 있다는 사실은 해당 주제의 모든 주장 검수가 끝났다는 뜻이 아니다. 각 항목의 review_scope를 확인한다.
