# Gemini 루틴 요청 해석

현재 구현: [Gemini 어댑터](../server/gemini.mjs), [설정 검증](../server/config.mjs), [이름 해석·제안](../server/routine-intent.mjs), [기존 채팅과 연결](../server/chat-service.mjs). 사용자가 지정한 Gemini만 사용한다. 기본 권장 모델은 Gemini 3.5 Flash-Lite이며 실제 호출은 `.env`의 모델을 따른다.

## 설정과 활성화

```dotenv
GEMINI_API_KEY=실제_키는_env에만_입력
AGENT_MODEL=gemini/gemini-3.5-flash-lite
AGENT_TIMEOUT_SECONDS=10
```

서버 시작 때 키와 모델이 모두 비어 있으면 이전 각본 대역으로 실행한다. 하나만 있거나 모델의 제공자가 gemini가 아니면 명확한 설정 오류로 시작을 중단한다. 키가 있는데 실제 호출에 실패한 경우 각본 쓰기로 자동 전환하지 않는다. 설정을 바꾼 뒤 서버를 재시작한다. 제한 시간은 1~30초이며 기본 10초다.

공식 근거는 [generateContent 구조화된 출력](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [GenerationConfig](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig), [키 인증](https://ai.google.dev/gemini-api/docs/api-key)이다. 별도 SDK 없이 Node fetch로 고정된 Google HTTPS generateContent 엔드포인트를 호출한다. 키는 x-goog-api-key 헤더에만 넣고 URL·브라우저·로그·오류 응답에는 넣지 않는다.

## 요청과 처리 범위

- 한 요청에 최대 한 번 호출한다. 자동 재시도·도구 루프·검색·외부 MCP는 없다. 출력 상한은 1,024토큰이며 JSON 스키마를 지정한다.
- AI에는 이번 사용자 문장과 현재 목차 이름·삭제되지 않은 항목 이름/목차만 보낸다. 날짜별 답변·회고 본문·점수·일정·DB 사본·대화 이력·항목 ID는 보내지 않는다.
- 해석 결과는 `{intent, groupName, routineName}`이며 intent는 add/delete/clarify/unsupported만 허용한다. 이름은 문자열 또는 null이다. 허용하지 않은 필드·명령·ID·잘린 출력·차단 응답은 저장 제안으로 쓰지 않는다. 프로그램에서도 다시 검사한다.
- 현재 자연어 기능은 루틴 **정의** 추가(O/X)·삭제다. 사용 중지·수정·날짜별 답변·복수 변경·대량 삭제는 이 AI 기능의 범위가 아니다.
- 기존 정해진 일정·목차·숫자 조회는 각본 기능으로 유지한다. 알려진 각본 요청이 루틴 추가/삭제이면 Gemini를 거친다. 기존 해석기가 이름·목차를 찾지 못했거나 입력 검증 안내를 반환한 경우도 같은 경로다. 나머지 알려진 각본 기능은 모델 호출 없이 처리한다. 각본이 이해하지 못한 자연어 요청도 Gemini에 보내 루틴 요청인지 판별한다.

## 제안과 확인

AI가 ID나 저장 명령을 실행하지 않는다. 서버가 현재 이름에서 정확히 일치하는 대상을 찾고 공통 명령을 생성한다. 같은 이름이 여러 개면 목차와 항목 후보를 보여준다. 추가 목차가 없으면 후보를 고르게 하며 없는 목차/항목은 다시 묻는다. 임의 유사 항목을 자동 선택하지 않는다.

해석 중 다른 수정이 있으면 원래 revision의 제안을 만들지 못하고 충돌로 재요청한다. 해석 결과·제안·후보 선택만으로 다이어리 상태를 바꾸지 않는다. 기존 [HTTP 확인 계약](http-contract.md)에 따라 확인 후 저장하고, 삭제 후 과거 문항·답변·집계를 보존한다.

이전 대화는 전달하지 않는다. “그거 지워줘”처럼 이름이 없는 지시나 여러 변경은 구체적인 항목과 작업을 다시 요청한다. 재질문은 대화 기억 구현이 아니다. 사용자는 이름·목차·작업을 포함한 전체 요청을 다시 보내거나 화면 후보를 선택한다.

## 표시와 실패

`GET /api/diary`의 chatMode는 gemini 또는 scripted다. 채팅 상단은 활성 모드를 표시하고 각 답변에는 Gemini 또는 목데이터 출처를 표시한다. Gemini 오류 시 입력을 남기며 수동 항목 관리·기록은 계속 사용할 수 있다.

- 키/권한 오류: model_auth_error (503), 모델 없음: model_not_found (503).
- 한도 초과: model_rate_limited (429), 시간 초과: model_timeout (504).
- 잘못된/불완전한 출력: model_invalid_output (502), 연결/제공자 오류: model_unavailable (503).

제공자의 원문 오류·요청 본문·응답·키를 출력하지 않고 일반 안내만 반환한다. HTTP 클라이언트 제한 시간은 40초로 서버의 최대 모델 제한 30초보다 길다. 실패 자체로 기록을 변경하거나 성공을 표시하지 않는다.

## 검증과 다음 확인

`npm --prefix sample2 test`는 실제 키 없이 설정·프로토콜·실패·이름 선택·충돌을 검사한다. 브라우저의 gemini.cjs는 해석 대역을 주입해 모드 표시·확인·실패 시 입력 유지·수동 관리 유지를 확인한다. 이 자동 검사들은 외부 모델 품질 검사와 다르다.

실제 연결을 검사하려면 **별도** `npm --prefix sample2 run check:gemini`를 실행한다. `.env` 키를 사용해 실제 요청 4건을 보내므로 호출 한도/비용이 발생할 수 있다. 합성 자료를 담은 임시 서버·DB에서 자연어 추가·삭제, 모호한 이름, 없는 항목을 확인하고, 확인 반복·삭제 후 답변/리포트 보존도 검사한다. 사용자 DB는 수정하지 않으며 종료 시 임시 자료를 제거한다.

이번 실제 연결 검사 4건은 통과했다. 다양한 한국어 표현·복잡한 요청·장기 사용 품질 전체가 검증된 것은 아니다. 사용자는 [직접 테스트](manual-check.md)의 Gemini 예시부터 확인하면 된다.
