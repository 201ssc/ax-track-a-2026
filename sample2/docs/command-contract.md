# 저장 코어와 공통 변경 명령

현재 구현: [공통 명령](../commands.mjs), [SQLite 저장소](../server/store.mjs), [서울 시간 기준](../server/clock.mjs), [CLI](../server/cli.mjs). HTTP·화면·채팅 제안 연결은 [HTTP 계약](http-contract.md)에 있다. 이 계약은 날짜별 기록과 항목 정의를 구분하며 [제품 규칙](product-rules.md)을 따른다.

## 입력과 성공 결과

`DiaryStore.execute()`는 JSON 요청 `{requestId, expectedRevision, type, payload}`를 받는다. 요청 ID는 비어 있지 않은 문자열 128자 이내, 수정 번호는 0 이상의 안전한 정수다. 아래에 없는 명령·필드·전체 상태·문항 사본은 받지 않는다. 객체 키 순서만 다른 같은 요청은 같은 요청으로 처리하며 문자열 내용까지 자동으로 같다고 간주하지 않는다.

성공 결과는 `{requestId, revision, result}`다. 생성 결과의 `result.id`는 서버가 만든 ID다. 저장 뒤 `read()`로 `{state, revision, today, timeZone, updatedAt}`을 다시 읽는다. `updatedAt`은 DB의 마지막 저장 시각이며 단순 조회 때 바뀌지 않는다.

| 명령 | payload 필수 필드 | 선택 필드·의미 |
| --- | --- | --- |
| `routine.create` | `groupId, title` | `type` 기본 ox, `description`, `options`. 관리 화면용 네 형식 지원. 첫 채팅 도구에서는 ox만 사용 |
| `routine.update` | `id, groupId, title, type` | `description, options`. ID·사용 여부·purpose 유지, 과거 문항 사본 유지 |
| `routine.delete` | `id` | 기록이 있으면 삭제 표식, 없으면 정의 제거. 날짜별 기록 유지 |
| `routine.set-active` | `id, active` | boolean. 중지·재개이며 삭제와 다름 |
| `routine.move` | `id, direction` | direction은 -1 또는 1, 같은 목차의 표시 순서 이동 |
| `group.create` | `name` | 새 ID·기본 아이콘 |
| `group.update` | `id, name` | 목차 이름 변경 |
| `group.pause` | `id` | 각본 채팅 호환: 항목 일괄 중지, 빈 목차는 제거 |
| `group.delete` | `id` | 삭제 표식 외 항목이 없어야 함 |
| `group.move` | `id, direction` | direction은 -1 또는 1 |
| `answers.save` | `date, values` | values는 문항 ID → 응답 문자열. 서버가 문항 구성을 결정하고 일부 답변만 저장. 지우기는 별도 명령 |
| `answers.remove` | `date, id` | 해당 날짜의 저장 답변 제거. 제목 답변이면 다음 날 제목도 함께 제거 |
| `title.set` | `date, text` | 표시 날짜 기준, 빈 문자열로 제목 제거 가능. 전날 답변과 함께 저장 |
| `title.set-checked` | `date, checked` | boolean. 해당 날짜부터 가능 |
| `schedule.save` | `date, text` | `id`가 있으면 수정, 없으면 생성. 날짜 이동 시 체크 초기화 |
| `schedule.delete` | `id` | 일정 제거 |
| `schedule.set-checked` | `id, checked` | boolean. 해당 날짜부터 가능 |

항목·목차 이름은 공백 제거 후 1~80자다. 삭제되지 않은 같은 목차의 동명 항목은 거절하며 기존 동명 항목을 자동 병합하지 않는다. 단일 선택지는 중복 없이 2~20개, 각 1~80자다. 설명은 4,000자 이내, 일정은 1~200자다. 제목·응답 길이와 형식 검사는 기존 모델 규칙도 함께 적용한다. `YYYY-MM-DD`는 실제 존재하는 날짜여야 하며 답변은 서울 기준 오늘과 과거만 저장한다.

호환 `messages`는 저장 상태에 보존하지만 신규 명령이나 AI 도구로 등록하지 않았다. 목차 채팅의 일괄 중지는 `group.pause`에 연결했으며 일반 빈 목차 삭제와 구분한다.

## 실패와 재시도

- `invalid_command` (422): 필드·입력·날짜·규칙 위반. `unknown_command` (422): 허용하지 않은 명령.
- `not_found` (404): 대상 없음 또는 삭제됨.
- `revision_conflict` (409): 새로운 요청의 수정 번호가 최신 자료와 다름. 재조회·입력 보존·재확인 후 새 요청 ID 사용.
- `request_id_reused` (409): 기존 요청 ID에 다른 본문 사용.
- DB 오류: 호출자에게 오류를 전달하고 상태와 요청 성공 기록 모두 롤백한다. CLI는 `storage_error` 또는 드라이버 오류 코드를 출력하고 종료 코드 1로 끝난다. HTTP는 내부 DB 오류를 503 storage_error로 반환하며 내부 상세를 노출하지 않는다.

성공 요청 결과는 DB에 보관하며 재시작 뒤 재전송도 같은 결과를 돌려준다. 재시도는 **기존 expectedRevision을 포함한 같은 요청 전체**를 보낸다. 성공 결과 확인은 오래된 revision 검사보다 먼저다. 실패한 요청은 성공 기록을 남기지 않는다.

## 실행과 데이터 범위

Node 24.18.1 이상 24 계열. npm 의존성 설치 없이 저장소 루트에서 실행한다. 다음 예시는 실제 DB를 만드는 수동 실행법이다. 자동 테스트는 모두 임시 경로를 사용한다.

```bash
node sample2/server/cli.mjs init /tmp/habit-diary-review.sqlite
node sample2/server/cli.mjs read /tmp/habit-diary-review.sqlite
node sample2/server/cli.mjs command /tmp/habit-diary-review.sqlite <<'JSON'
{"requestId":"review-add-1","expectedRevision":0,"type":"routine.create","payload":{"groupId":"life","title":"명상"}}
JSON
node sample2/server/cli.mjs backup /tmp/habit-diary-review.sqlite /tmp/habit-diary-review-backup.sqlite
```

기존 DB의 revision이 0이 아니면 예시 요청은 충돌할 수 있다. `read` 결과를 기준으로 새 요청을 구성한다. `init`을 반복해도 기존 상태와 수정 번호는 유지되며 백업은 기존 대상 파일을 덮어쓰지 않는다. 경로를 생략하면 `.env`/환경의 DIARY_DB_PATH를 사용하고, 없으면 `$XDG_DATA_HOME/iruo-habit-diary/diary.sqlite`, 환경값이 없으면 `~/.local/share/iruo-habit-diary/diary.sqlite`를 사용한다. `read/command/backup`은 없는 DB를 자동 생성하지 않는다. 사용자 브라우저의 localStorage와 연결하거나 초기화하지 않는다.

CLI의 최초 스키마 버전 1은 `diaries`, `command_receipts`를 만든다. HTTP 서버 시작 시 백업 후 스키마 버전 2로 갱신해 `proposals`를 추가한다. 이후 CLI도 버전 2를 읽고 쓸 수 있다. 알 수 없는 스키마·저장 상태 버전·손상 자료를 예시로 덮어쓰지 않는다. 기존 DB를 바꾸는 후속 마이그레이션은 백업·복원 검사를 포함해야 한다.

검증 명령: `node --test sample2/tests/*.test.mjs`. 실제 파일·별도 프로세스·동시 수정·DB 실패 주입·백업 복원은 [storage.test.mjs](../tests/storage.test.mjs)에서 확인한다. 화면 연결 검증과 실제 AI 검증을 대신하지 않는다.
