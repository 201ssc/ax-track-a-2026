"""도구 4종 — 메뉴 검색, 재고 확인, 주문서 생성(금액 문제 출제), 코드 채점.

각 도구는 스키마(OpenAI function 형식)와 순수 파이썬 구현의 쌍입니다.
에이전트 루프는 TOOL_SCHEMAS를 모델에 넘기고, 모델이 고른 도구를 execute()로 실행합니다.
합계 금액의 정답 판정은 LLM이 아니라 check_answer(코드)가 합니다.
"""

from tools.menu import SCHEMA as MENU_SCHEMA
from tools.menu import search_menu
from tools.order import SCHEMA as ORDER_SCHEMA
from tools.order import create_order
from tools.quiz import CHECK_ANSWER_SCHEMA
from tools.quiz import check_answer
from tools.stock import SCHEMA as STOCK_SCHEMA
from tools.stock import check_stock

TOOL_SCHEMAS = [MENU_SCHEMA, STOCK_SCHEMA, ORDER_SCHEMA, CHECK_ANSWER_SCHEMA]

_IMPL = {
    "search_menu": search_menu,
    "check_stock": check_stock,
    "create_order": create_order,
    "check_answer": check_answer,
}


def execute(name: str, arguments: dict) -> dict:
    """도구를 실행합니다. 실패해도 예외 대신 error를 돌려줘 모델이 스스로 고치게 합니다."""
    if name not in _IMPL:
        return {"error": f"알 수 없는 도구: {name}"}
    try:
        return _IMPL[name](**arguments)
    except Exception as exc:
        return {"error": f"도구 실행 실패: {exc}"}
