"""에이전트 루프 — 도구를 부를지, 몇 번 부를지, 언제 멈출지를 모델이 결정합니다.

이 while 루프가 하네스의 씨앗입니다. 지금은 루프뿐이지만, 여기에
가드레일·검증·메모리가 붙으면 하네스 엔지니어링이 됩니다.

'수학왕 분식' — 손님이 주문하면 재고를 확인하고, 단가를 계산식으로 낸다.
손님이 합계 금액을 맞혀야 주문이 완료되고, 그때 재고가 차감된다.
'금액이 맞는지'는 반드시 check_answer(코드)가, 재고 차감도 코드가 책임진다.
"""

import json

from agent import session
from llm.client import complete
from tools import TOOL_SCHEMAS, execute
from tools.stock import deduct_stock

SYSTEM_PROMPT = """\
너는 분식집 '수학왕 분식'의 주문 접수 점원이다. 손님이 주문하면 그 합계 금액을
손님이 직접 계산해 맞혀야 주문이 완료된다. 한국어로 유쾌하고 친절하게, 간결히 응대한다.

규칙:
- 대화는 이어진다 — 방금 만든 주문서(금액 문제)와 손님의 답을 기억하고 이어서 응대한다
- 손님이 재고를 물으면 check_stock으로 조회해 알려준다 (menu_id 생략 시 전체 재고,
  남은 수량이 0이면 품절이라고 안내한다)
- 손님이 메뉴 이름을 말하며 주문하면 반드시 먼저 create_order를 호출한다. 네가 가격을
  알거나 추측해서 말하지 마라 — 도구를 부르지 않고 단가·합계 금액을 언급하는 것은 금지다
- create_order는 제품명·수량과 단가 '계산식'(예: '500 × 7'), 그리고 합계 계산식(expression)을
  돌려준다. 단가나 합계를 절대 숫자로 알려주지 말고, "합계가 얼마일까요?"라고 문제로만 낸다
  (손님이 그 계산식들을 직접 풀어 합계를 맞히게 한다)
- create_order가 재고 부족(error)을 돌려주면 정중히 품절을 알리고 다른 메뉴를 제안한다
- 손님이 금액(숫자)을 답하면 반드시 check_answer로 채점한다. expression에는 주문서의
  계산식을, user_answer에는 손님이 말한 숫자를 넣는다. 절대 직접 암산해서 판정하지 마라
- check_answer 결과가 correct=true면 축하하며 "주문이 완료되었습니다"라고 마무리한다
- correct=false면 정답 금액을 알려주지 말고 "다시 시도해보세요"라며 격려한다 (힌트 정도만)
- 메뉴에 없는 항목은 정중히 거절하고 대안을 제시한다. 수량을 말하지 않으면 1개로 본다
- 답변은 한두 문장으로 간결하게, 마크다운 기호(** ## 등)는 쓰지 않는다
"""

MAX_TURNS = 8  # 무한 루프 방지 — 도구 왕복 횟수 상한


def run_agent(user_message: str, history: list[dict] | None = None, session_id: str | None = None) -> dict:
    """history: 세션에 쌓인 이전 손님-점원 대화 (user/assistant 메시지 목록).
    session_id: 완료 시 재고를 차감할 '대기 주문'을 세션에 기억/회수하기 위해 씁니다.
    """
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *(history or []),
        {"role": "user", "content": user_message},
    ]
    order = None  # 이번 응답에서 만든 주문서 (items + expression)
    grade = None  # 이번 응답에서 채점한 결과
    nudged = False

    for _ in range(MAX_TURNS):
        response = complete(messages, tools=TOOL_SCHEMAS)
        message = response.choices[0].message

        # 도구 호출이 없으면 모델이 답을 확정한 것 — 루프를 멈춥니다
        if not message.tool_calls:
            content = (message.content or "").strip()
            # 가드레일 — 보여줄 것(주문서·채점)도 없는데 빈 답이 오면 한 번 재지시
            if not content and order is None and grade is None and not nudged:
                nudged = True
                messages.append(
                    {"role": "user", "content": "방금 확인한 내용을 손님에게 한두 문장으로 말해 주세요."}
                )
                continue

            final = {"message": content}
            if order:
                final["order"] = order
                # 금액 문제를 낸 주문을 '대기 주문'으로 기억 — 정답 맞히면 이 재고를 차감
                if session_id:
                    session.set_pending(session_id, order["items"])
                if not final["message"]:
                    final["message"] = "주문서를 만들었어요. 합계 금액이 얼마일까요?"
            if grade is not None:
                final["grade"] = grade
                if grade.get("correct"):
                    final = _complete_order(final, session_id)
                elif not final["message"]:
                    final["message"] = "아쉬워요, 금액이 맞지 않아요. 다시 시도해보세요!"
            if not final["message"]:
                final["message"] = "무엇을 주문하시겠어요? 아래 메뉴를 눌러보세요."
            return final

        # 모델의 도구 호출 결정과 실행 결과를 대화 이력에 쌓고 재호출합니다
        messages.append(message.model_dump(exclude_none=True))
        for call in message.tool_calls:
            arguments = json.loads(call.function.arguments or "{}")
            result = execute(call.function.name, arguments)
            if call.function.name == "create_order" and "items" in result:
                order = result
            if call.function.name == "check_answer" and "correct" in result:
                grade = result
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": json.dumps(result, ensure_ascii=False),
                }
            )

    return {"message": "죄송합니다, 처리가 길어졌어요. 다시 한 번 말씀해 주시겠어요?"}


def _complete_order(final: dict, session_id: str | None) -> dict:
    """정답을 맞혔을 때 — 대기 주문의 재고를 차감하고 주문을 확정합니다.

    재고 차감은 원자적(전량 확보 안 되면 아무것도 차감 안 함)입니다. 주문과 정답
    사이에 재고가 빠져나갔으면 완료 대신 품절을 안내합니다.
    """
    pending = session.pop_pending(session_id) if session_id else None
    if pending:
        error = deduct_stock(pending)
        if error:  # 그사이 품절됨
            final["message"] = f"{error['error']} — 아쉽게 방금 품절됐어요. 다른 메뉴는 어떠세요?"
            final["grade"]["correct"] = False
            return final
        final["stock_deducted"] = True
    final["completed"] = True
    if not final["message"]:
        final["message"] = "정답입니다! 주문이 완료되었습니다 🎉"
    return final
