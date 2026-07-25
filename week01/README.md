# 🧮 수학왕 분식 — 개조 버전 (Week 01)

> 이 프로젝트는 강의에서 제공한 원본 템플릿 **`분식왕 주문 에이전트`** 를
> 직접 개조한 버전입니다. **"주문한 메뉴의 금액을 손님이 직접 계산해 맞혀야
> 주문이 완료되는"** 수학 게임으로 바꿨습니다.

## 무엇을, 왜 바꿨나

원본의 핵심 설계 원칙은 **"가격 계산은 LLM이 아니라 코드가 한다"** 입니다.
이 원칙을 그대로 이어받아 **"금액 정답 판정도 코드(`check_answer`)가 한다"** 로
확장했습니다. LLM은 문제를 내고 대화만 하고, 계산·판정은 결정적인 코드가 맡습니다.

| 원본 (분식왕) | → | 개조 (수학왕 분식) |
|---------------|---|--------------------|
| 주문하면 가격을 **알려줌** | → | 가격을 **문제로 냄**, 손님이 맞혀야 완료 |
| 단가를 숫자로 표시 (`3,500원`) | → | 단가를 **계산식**으로 표시 (`500 × 7`) |
| `create_order`가 합계 계산 | → | `create_order`는 계산식만, 합계는 **숨김** |
| — | → | `check_answer`(신규): 코드가 식을 계산해 **정답 판정** |
| 재고 확인·차감 | → | 유지 — 단, **정답을 맞힌 순간** 재고 차감 |

**바꾼 파일**
- `tools/order.py` — 단가를 계산식으로 출제, 합계는 숨김 (`data/price_puzzles.json`의 샘플 사용)
- `tools/quiz.py` (신규) — `ast` 기반 안전 계산기로 정답 판정 (사칙연산·거듭제곱)
- `data/price_puzzles.json` (신규) — 가격 → 계산식 샘플 (AI로 매번 생성하지 않고 데이터로 관리)
- `agent/loop.py` — 주문→금액문제→채점 흐름, 정답 시 재고 차감 (세션에 '대기 주문' 기억)
- `web/index.html` — 인디고 테마, 금액 숨김 주문서 + 계산식, 채점/완료 UI

실행 방법(Docker / uv / `.env` 설정)은 원본과 동일합니다 — 아래 참고.

---

<details>
<summary>📄 아래는 원본 <b>분식왕</b> 템플릿의 README입니다 (참고용)</summary>

# week01-order-agent — 분식왕 주문 에이전트

가상 분식집 **"분식왕"의 주문 접수 AI 점원**입니다. 1주차 라이브 빌드에서
Claude Code에 지시 프롬프트를 주어 **지시 → 생성 → 검증 → 수정 사이클**로
완성하는 시연용 저장소입니다.

- **v0.1** — 시연 시작점. `/order`가 고정 문자열만 돌려주는 "거짓말하는 API"
- **v1.0** — 시연 종료점. 에이전트 루프가 도구(메뉴 검색·재고 확인·주문서 생성)를
  골라 쓰며 주문서 json을 반환

시연에서 무엇이 만들어졌는지는 태그 간 diff 하나로 볼 수 있습니다.

```bash
git diff v0.1 v1.0
```

## 구조

```plaintext
week01-order-agent
├── app/
│   └── main.py          # FastAPI — /order가 에이전트 루프 호출
├── agent/
│   ├── loop.py          # 에이전트 루프 (도구 호출 여부를 모델이 결정)
│   └── session.py       # 세션 메모리 (대화 이력, TTL 만료, 동시성 잠금)
├── llm/
│   └── client.py        # LiteLLM 래퍼 (MODEL 환경변수로 모델 교체)
├── tools/
│   ├── menu.py          # 메뉴 검색 — data/menu.json
│   ├── stock.py         # 재고 확인 — data/stock.json
│   └── order.py         # 주문서 생성 — 단가·합계는 코드가 계산
├── web/
│   └── index.html       # 웹 주문 화면 (채팅형 UI, /order 호출)
├── data/
│   ├── menu.json        # 메뉴 22개 (이름·가격·옵션)
│   └── stock.json       # 재고 시드 — 런타임 상태는 stock.state.json (gitignore)
├── .env.example         # GEMINI_API_KEY, MODEL
├── pyproject.toml       # litellm, fastapi 등 의존성 선언
├── PROMPT.md            # 시연에서 사용한 지시 프롬프트 원문
├── Dockerfile
├── compose.yml          # 기본 실행
├── compose.dev.yml      # 개발용 (소스 마운트 + 자동 리로드)
└── README.md
```

시연 시작점(목 API)은 `git checkout v0.1`로 볼 수 있습니다.

## 실행 방법

### 1. 환경변수 준비

```bash
cp .env.example .env
```

`.env`에 [Google AI Studio](https://aistudio.google.com/apikey)에서 발급한
`GEMINI_API_KEY`를 채웁니다. 파일 대신 웹 화면의 **⚙️ 설정** 버튼으로
입력해도 됩니다. 키가 없으면 `/order` 호출이 인증 오류를 돌려줍니다.

`MODEL`은 LiteLLM 모델 문자열입니다. 이 값만 바꾸면 코드 수정 없이
다른 프로바이더로 전환됩니다 (예: `anthropic/claude-sonnet-5`, `ollama/llama3`).

### 2. Docker Compose로 실행

**기본 실행** — 이미지에 구운 코드를 그대로 실행합니다.

```bash
docker compose up --build
```

**개발 모드** — 소스를 컨테이너에 마운트하고 `--reload`로 실행하므로,
코드가 바뀌면 재빌드 없이 즉시 반영됩니다. 라이브 빌드는 이 모드로 진행합니다.

```bash
docker compose -f compose.dev.yml up --build
```

### 3. 주문해 보기

**웹 화면**: <http://localhost:8000> 에 접속해 채팅으로 주문합니다.

- 예시 버튼(정상 주문·메뉴에 없는 항목·재고 초과)이 준비되어 있습니다
- **대화가 이어집니다** — 서버가 세션별로 대화 이력을 기억하므로
  "김밥 2개 주세요" → "참치김밥으로요" 같은 다단계 주문이 됩니다.
  현재 세션 id는 입력창 아래에 표시됩니다 (30분 미사용 시 만료)
- 메뉴판을 요청하면 카테고리별 표로 보여줍니다
- 입력창에 `/clear`를 치면 서버의 세션 이력까지 지우고 새 대화를 시작합니다
- `/reset`을 치면 주문으로 차감된 재고가 처음 상태로 돌아갑니다
- 오른쪽 위 **⚙️ 설정** 버튼에서 `.env`의 `GEMINI_API_KEY`, `MODEL`을
  확인·저장할 수 있습니다. 저장하면 서버의 `.env`에 기록되고 즉시 적용됩니다
  (개발 모드에서는 호스트의 `.env` 파일에 그대로 남습니다). 로컬 시연용
  기능이므로 외부에 공개된 서버에서는 사용하지 마세요.

**curl**:

```bash
curl -s -X POST http://localhost:8000/order \
  -H "Content-Type: application/json" \
  -d '{"message": "참치김밥 두 줄이랑 라면 하나, 라면은 치즈 추가"}'
```

응답 — 주문서 json (단가·합계는 모델이 아니라 `tools/order.py`가 계산):

```json
{
  "message": "참치김밥 두 줄과 치즈 추가 라면 하나, 총 13,500원입니다!",
  "items": [
    { "name": "참치김밥", "quantity": 2, "options": [], "unit_price": 4500, "subtotal": 9000 },
    { "name": "라면", "quantity": 1, "options": ["치즈 추가"], "unit_price": 4500, "subtotal": 4500 }
  ],
  "total": 13500
}
```

메뉴에 없는 항목("돈까스 되나요?")이나 재고 초과("김밥 100줄")는 정중히
거절하고 대안을 제시합니다.

주문이 확정되면 그 수량만큼 재고가 차감됩니다 (동시 주문은 잠금으로 보호,
전량 확보가 안 되면 아무것도 차감하지 않음). `data/stock.json`은 초기
재고(시드)라 변하지 않고, 차감된 현재 재고는 gitignore된
`data/stock.state.json`에 기록됩니다 — 저장소는 항상 깨끗하게 유지됩니다.

재고 초기화: 채팅에 `/reset` 입력 (또는 `POST /stock/reset`, 상태 파일 삭제)

응답의 `session_id`를 다음 요청에 그대로 넣으면 대화가 이어집니다
(웹 화면은 자동으로 처리합니다). `DELETE /session/{session_id}`로 이력을
지웁니다. 세션은 서버 메모리에만 있으므로 재시작하면 사라집니다 —
영속화·분산 세션은 이후 주차 주제입니다.

### (선택) 로컬에서 uv로 실행

```bash
uv sync
uv run uvicorn app.main:app --reload
```

## 기술 원칙

- 모든 LLM 호출은 **LiteLLM 경유** — 프로바이더 SDK 직접 호출 금지
- 모델 문자열은 환경변수 `MODEL`로 분리 — 이 값만 바꾸면 Gemini도 Claude도
  로컬 모델도 됩니다
- 모듈 분리: `llm/` `tools/` `agent/` — 단일 파일 금지
- 결과는 구조화 출력(주문서 json) — LLM은 채팅이 아니라 시스템 부품

## 브랜치 전략

git flow를 따릅니다.

- `main` — 릴리즈 전용 (v0.1, v1.0 태그)
- `develop` — 통합 브랜치
- `feature/*` — 작업 브랜치

</details>
