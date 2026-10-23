# 가계부 구현 참고 분석

참고자료는 다른 사람이 만든 [account-book](https://github.com/2026-ai-service-engineering-a/account-book)이며 분석한 원본 버전은 아래 커밋 링크에서 확인할 수 있다. 2026-10-23 확인 시 로컬 HEAD와 원격 main은 `c741b8cfaa424ad2714988b1725aaff44c5eb4c6`으로 같았다. 이후 작업에서는 버전이 달라질 수 있다.

다이어리의 기준은 사용자가 만든 `sample2`다. 가계부는 실제 동작과 규칙 관리 방식을 배우기 위한 자료이며, 그 데이터 모델·서비스 수·개발 제한을 자동 채택하지 않는다.

## 확인한 실제 처리 경로

| 경로 | 가계부 구현 | 주요 코드 |
| --- | --- | --- |
| 수동 기록 | 폼 제출 → API 검증 → DB 저장. 같은 요청은 중복 실행 방지 | [폼](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/src/ui/interfaces/routers/transaction_form_router.py), [중복 실행 방지](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/src/api/application/use_cases/idempotent_write.py) |
| 채팅 기록 | 값 추출·분류 → 제안을 서버에 보관 → 확인 후 거래 생성 | [추출](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/src/agent/application/use_cases/read_capture.py), [제안](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/src/agent/application/use_cases/propose_record.py), [확인](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/src/agent/application/use_cases/decide_record.py) |
| 채팅 조회 | 읽기 도구 선택 → 코드의 기간 계산 → API 집계 → 숫자 검증 후 답변 | [질문](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/src/agent/application/use_cases/answer_question.py), [답변](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/src/agent/application/use_cases/answer_text.py) |
| 리포트 | 기본 통계 먼저 표시, AI 분석은 별도 요청·캐시 | [화면](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/src/ui/interfaces/routers/reports_router.py), [캐시](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/src/agent/application/use_cases/cached_insights.py) |
| 실제 연결/대역 | 환경 설정에 따라 HTTP API 또는 메모리, 실제 agent 또는 각본 대역 선택 | [조립 코드](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/src/ui/main.py), [대역 설명](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/ui_docs/stand-ins.md) |

README 일부는 채팅·AI 리포트가 아직 대역이라고 설명하지만 현재 조립 코드에는 실제 연결 경로가 있다. 설계 문구만으로 구현 완료 여부를 판단하지 않는다. 이번 분석에서 서비스를 구동하지 않았으며 DB·실제 LLM 동작 검증 결과는 없다.

## 규칙 관리에서 참고할 점

- [개발 규칙](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/docs/development-rules.md)으로 코드 역할·의존 방향·검사 방법을 정한다.
- [API 계약](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/docs/api-contract.md)과 [AI 기능 문서](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/docs/ai/README.md)를 분리해 외부 입력, 기능 흐름, 실패 처리를 설명한다.
- 기능별 코드·테스트를 대응시킨다. 대역 검사와 실제 모델 평가는 별개다.
- [검사 스크립트](https://github.com/2026-ai-service-engineering-a/account-book/tree/c741b8cfaa424ad2714988b1725aaff44c5eb4c6/scripts/)와 Makefile로 기계적인 규칙을 확인한다. 다이어리에 같은 자동 검사가 이미 설치됐다는 뜻은 아니다.

다이어리에서는 인덱스 → 담당 규칙 → 관련 코드 → 완료 검증으로 연결한다. 현재 규칙은 담당 문서 한 곳에서 관리하고, 변경 이유는 `DECISIONS.md`, 작업 상태는 `HANDOFF.md`에 둔다. 가계부에도 문서와 코드가 어긋난 사례가 있으므로 문서 존재만으로 정합성을 보장한다고 가정하지 않는다.

## 그대로 적용하지 않을 부분

- 채팅 쓰기는 현재 거래 생성 하나다. 거래 수정·삭제 API가 있어도 채팅 도구 전체가 구현된 것은 아니다.
- 거래 삭제는 실제 거래를 지운다. 다이어리의 항목 삭제 후 과거 답변 보존은 별도 규칙이다.
- 금액과 질문 낱말로 기록/질문을 구분하는 라우터는 가계부 전용이다.
- 거래 카테고리 분류·법령 문서 검색·벡터 검색·외부 MCP는 첫 루틴 도구의 필수 구성요소가 아니다.
- 질문마다 새로 처리하며 이전 대화를 다음 질문 문맥으로 보내지 않는다. 실행 로그 보관은 대화 기억 기능과 다르다.
- 단일 사용자 전제다. 확인 헤더만으로 로그인·사용자별 권한이 구현됐다고 볼 수 없다.

## 다이어리에 활용할 설계 방향

공통 저장 기능, 요청 해석과 저장의 분리, 변경 제안과 사용자 확인, 제한된 도구 범위, 실제 데이터 집계, 실패 시 수동 기능 유지 방식을 참고한다. 첫 도구는 [루틴 항목 추가·삭제](routine-tools.md)에 한정한다.

Python/FastAPI·PostgreSQL 및 별도 UI/agent/API 배포는 참고 후보였으며 현재 다이어리에 구현된 기술이 아니다. 2026-10-23 분석에서 다음 구현의 기준안은 기존 JavaScript 규칙을 공유하는 Node.js 단일 서버와 SQLite로 좁혔다. 선택 이유·한계와 가계부에서 가져오는 처리 원칙은 [저장·서버 설계](storage-server.md)를 따른다.
