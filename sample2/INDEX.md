# 습관 다이어리 문서 인덱스

기준: 2026-10-23. 이 문서는 작업 순서를 고정하는 계획표가 아니라, 작업마다 필요한 규칙·수정 범위·완료 확인 방법을 찾는 진입점이다. 새 세션은 이 문서와 [HANDOFF.md](HANDOFF.md)를 읽은 뒤 해당 작업 행으로 이동한다.

## 확정된 방향과 현재 상태

| 구분 | 내용 |
| --- | --- |
| 제품 기준 | 사용자가 만든 `sample2`의 화면과 기록 규칙 |
| 참고자료 | 다른 사람이 만든 [account-book](https://github.com/2026-ai-service-engineering-a/account-book), [분석 버전](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6) |
| 개발 목적 | 개인용으로 간단히 시작하고 고도화 후 여러 사용자용으로 확장 |
| 첫 채팅 도구 범위 | 루틴 항목 자체의 추가·삭제. 날짜별 O/X 답변 입력·삭제와 구분 |
| 현재 완료 범위 | 개인용 저장·서버·Gemini 루틴 추가/삭제 MVP와 사용자 작동 확인 |
| 테스트 자료 | 사용자가 직접 넣은 기존 테스트 입력은 제거 가능. 기본 예시는 유지. 아직 초기화하지 않음 |
| 현재 구현 | 기존 UI + Node.js HTTP + SQLite. Gemini의 루틴 추가·삭제 해석과 서버 제안/확인. 기존 일정·조회는 각본 |
| 현재 작업 상태 | HTTP·화면·채팅 및 Gemini 연결 검증 완료. 삭제 요청 분기 오류 수정 후 사용자 성공 확인. 첫 루틴 추가·삭제 MVP 완료 |

다음 구현의 기술 기준안은 **기존 UI + Node.js 단일 서버 + SQLite**다. 선택 이유·저장 계약·전환 범위는 [저장·서버 설계](docs/storage-server.md)에 있다. 저장 코어에서 Node.js/SQLite를 사용하기 시작했으며, 앞선 FastAPI/PostgreSQL 구성과 일정부터 구현하자는 안을 채택한 것이 아니다. AI 제공자는 Gemini로 선택했다. 경량 테스트 권장 모델은 Gemini 3.5 Flash-Lite이며 실제 호출을 연결하고 임시 DB에서 검증했다. 외부 배포는 후속 결정이다.

## 현재 작업과 다음 작업

| 상태 | 작업 | 관련 기준 |
| --- | --- | --- |
| 완료 | 규칙 문서 체계와 개인용 저장·서버 기준안 정리 | 이 인덱스, [저장·서버 설계](docs/storage-server.md) |
| 완료 | SQLite 저장 코어·공통 변경 명령·CLI와 실제 파일 검사 | [명령 계약](docs/command-contract.md), [검증 기준](docs/verification.md) |
| 완료 | HTTP·기존 UI 저장·첫 루틴 채팅 제안/확인 연결 | [루틴 도구 계약](docs/routine-tools.md), [검증 기준](docs/verification.md) |
| 사용자 확인 완료 | [직접 사용감 확인](docs/manual-check.md): 사용자 이상 없음 확인 | AI 대화 품질 확인과 구분 |
| 완료 | Gemini 루틴 요청 해석·실제 호출 검증 | [Gemini 계약](docs/gemini-contract.md) |
| 사용자 확인 완료 | Gemini 연결과 삭제 요청 분기 오류 수정 후 실제 채팅 성공 확인 | 다양한 표현의 전체 해석 품질 검증과 구분 |
| 후속 선택 | 개인 사용 중 문제 수집, 필요한 AI 도구 확장, 이후 여러 사용자용 전환 | 대화 기억·새 AI 도구·여러 사용자용 기능은 미구현. 자동 착수 범위가 아님 |

전체 작업 순서를 별도 문서로 고정하지 않는다. 다음 작업 착수 시 사용자의 요청 범위와 이 표를 맞추고, 완료한 구현·검증 결과를 갱신한다.

## 문서별 역할

| 문서 | 담당하는 기준 |
| --- | --- |
| [제품 규칙](docs/product-rules.md) | 기록·과거 보존·제목·일정·집계·데이터 취급 |
| [루틴 도구 계약](docs/routine-tools.md) | 첫 채팅 구현의 추가·삭제 의미, 현재 차이, 수정 범위, 완료 조건 |
| [Gemini 연결 계약](docs/gemini-contract.md) | 실제 호출·설정·데이터 전송 범위·오류·모델 검사 |
| [HTTP·화면 계약](docs/http-contract.md) | 실제 실행·설정·제안 확인·실패 처리 |
| [직접 테스트](docs/manual-check.md) | 사용자가 눌러 확인할 항목과 현재 테스트 경계 |
| [저장 코어·명령 계약](docs/command-contract.md) | 구현된 명령별 필드·오류·CLI·DB 스키마 |
| [저장·서버 설계](docs/storage-server.md) | 개인 MVP 기술 기준안, 데이터·API 경계, 서버 전환 범위와 검증 조건 |
| [개발 규칙](docs/development-rules.md) | 코드 역할, 변경 절차, 상태 표기, 새 세션 인수인계 |
| [검증 기준](docs/verification.md) | 작업별 실행 검사와 미구현 기능의 검증 조건 |
| [가계부 참고 분석](docs/reference-account-book.md) | 참고한 실제 구조, 적용할 원칙, 그대로 가져오지 않을 부분 |
| [DESIGN.md](DESIGN.md) | 현재 UI의 색상·폭·배치·메뉴 규칙 |
| [README.md](README.md) | 현재 실행 방법과 사용 가능한 기능 |
| [HANDOFF.md](HANDOFF.md) | 최신 진행 상태, 코드·저장 구조 지도, 검증 이력, 남은 결정 |
| [DECISIONS.md](DECISIONS.md) | 합의의 변경 이력. 과거 규칙이 포함되므로 현재 규칙표로 사용하지 않음 |

## 작업별 찾아보기

아래 순서는 개발 단계의 순서가 아니다. 수정 범위는 출발점이며 필요한 의존 파일을 함께 확인한다.

| 하려는 작업 | 먼저 읽을 기준 | 현재 관련 코드 | 완료 확인 |
| --- | --- | --- | --- |
| 루틴 항목 추가·삭제 및 채팅 도구 | [루틴 도구 계약](docs/routine-tools.md), [제품 규칙](docs/product-rules.md) | `app.js`, `model.mjs`, `chat.mjs` | 검증 기준의 항목 관리·채팅 행 및 도구 계약의 완료 조건 |
| 날짜별 답변·과거 기록 | [제품 규칙](docs/product-rules.md) | `model.mjs`, `app.js` | 모델·기록 브라우저 검사, 부분 저장·과거 보존 |
| 제목·일정·미래 날짜 | [제품 규칙](docs/product-rules.md), [DESIGN.md](DESIGN.md) | `model.mjs`, `app.js` | 제목·일정 및 미래 날짜 검사 |
| 리포트·채팅 수치 조회 | [제품 규칙](docs/product-rules.md) | `model.mjs`, `chat.mjs`, `app.js` | O/X/미기록·점수 평균·기간 기준 대조 |
| 예시·저장·초기화 | [제품 규칙](docs/product-rules.md), [개발 규칙](docs/development-rules.md) | `demo.mjs`, `prototype.mjs`, `app.js` | 예시 유지, 지정 범위 초기화, 새 기록 재초기화 없음 |
| UI·표시·캐시 | [DESIGN.md](DESIGN.md), [개발 규칙](docs/development-rules.md) | `index.html`, `styles.css`, `app.js`, `boot.js`, `update-assets.py` | 관련 브라우저 검사·화면 폭·시작 검사 |
| 서버·저장 방식 또는 AI 연결 | [저장·서버 설계](docs/storage-server.md), [개발 규칙](docs/development-rules.md), [루틴 도구 계약](docs/routine-tools.md) | `api.mjs`, `commands.mjs`, `server/gemini.mjs`, `server/routine-intent.mjs`, `server/` | 검증 기준의 서버 연결·AI 연결 전 준비 조건 |
| 문서·인수인계 | 이 문서, [개발 규칙](docs/development-rules.md) | 관련 Markdown | 링크·상태·중복 규칙의 정합성 |

구체적인 실행 명령과 검사 범위는 [검증 기준](docs/verification.md)에 있다.

## 문서가 충돌할 때

1. 사용자의 최신 명시적 지시를 우선한다.
2. 위 담당 문서의 현재 규칙을 확인한다. `DESIGN.md`는 UI, 제품 규칙은 기록 동작, 도구 계약은 새 채팅 범위, 저장·서버 설계는 기술 경계를 담당한다. 설계 기준안을 현재 구현으로 읽지 않는다.
3. `HANDOFF.md`와 `README.md`의 구현 상태를 코드로 확인한다. 미구현 목표를 현재 동작으로 설명하지 않는다.
4. 이유를 확인할 때 `DECISIONS.md`의 변경 이력을 읽는다. 날짜가 같으면 뒤에 추가된 결정을 확인한다.
5. 참고 가계부 문서는 설계 근거이며 다이어리의 규칙을 덮어쓰지 않는다.

충돌을 발견하면 코드에 맞춰 합의를 임의로 바꾸지 않는다. 명확한 최신 합의는 관련 문서에 반영하고, 실제로 결정되지 않은 제품 선택만 남은 결정으로 기록한다.
