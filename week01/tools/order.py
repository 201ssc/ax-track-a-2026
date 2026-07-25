"""주문서 생성 — 메뉴에서 단가를 찾되, 단가를 숫자가 아니라 '계산식'으로 낸다.

단가 3,500원은 그대로 보여주지 않고 data/price_puzzles.json에 미리 만들어 둔
계산식 샘플(예: "500 × 7")로 보여준다. 문제를 매번 AI로 만들지 않고 데이터에서
꺼내 꽂는다. 손님은 이 식들을 풀어 합계 금액을 맞히고, 판정은 check_answer(코드)가 한다.
"""

import json
import random
from pathlib import Path

from tools.menu import load_menu
from tools.stock import load_stock

_PUZZLE_PATH = Path(__file__).resolve().parent.parent / "data" / "price_puzzles.json"

SCHEMA = {
    "type": "function",
    "function": {
        "name": "create_order",
        "description": (
            "손님이 주문한 메뉴로 주문서를 만든다. 메뉴 이름과 수량을 넣으면 각 메뉴의 "
            "단가를 '계산식'(예: '500 × 7')으로, 합계 계산식(expression)을 함께 돌려준다. "
            "합계 금액은 알려주지 않는다 — 손님이 계산식을 풀어 직접 맞혀야 한다. "
            "돌려준 items(제품명·수량·단가식)를 보여주며 '합계가 얼마일까요?'라고 문제를 낸다."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "description": "주문 항목 목록",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "메뉴 이름 (예: '라면', '돈까스')",
                            },
                            "quantity": {"type": "integer", "description": "수량 (생략 시 1)"},
                        },
                        "required": ["name"],
                    },
                }
            },
            "required": ["items"],
        },
    },
}


def _load_puzzles() -> dict:
    return json.loads(_PUZZLE_PATH.read_text(encoding="utf-8"))


def _puzzle_for(price: int, puzzles: dict) -> str:
    """가격에 해당하는 계산식 샘플을 하나 고른다. 없으면 숫자 그대로 쓴다."""
    samples = puzzles.get(str(price))
    return random.choice(samples) if samples else str(price)


def _find(menu: list[dict], name: str) -> dict | None:
    name = (name or "").strip()
    for item in menu:  # 정확히 일치 우선
        if item["name"] == name:
            return item
    for item in menu:  # 없으면 부분 일치
        if name and name in item["name"]:
            return item
    return None


def create_order(items: list[dict]) -> dict:
    menu = load_menu()
    puzzles = _load_puzzles()
    stock = load_stock()
    order_items = []
    terms = []
    needed: dict[str, int] = {}  # 같은 메뉴가 여러 줄로 와도 합산해 재고 검증
    for entry in items:
        item = _find(menu, entry.get("name"))
        if item is None:
            return {"error": f"메뉴에 없는 항목: {entry.get('name')}"}

        quantity = int(entry.get("quantity", 1))
        if quantity < 1:
            return {"error": f"{item['name']}: 수량이 올바르지 않습니다 ({quantity})"}

        needed[item["id"]] = needed.get(item["id"], 0) + quantity
        puzzle = _puzzle_for(item["price"], puzzles)
        order_items.append(
            {"menu_id": item["id"], "name": item["name"], "quantity": quantity, "puzzle": puzzle}
        )
        # 단가식 × 수량 — 괄호로 묶어 곱셈이 단가식 전체에 걸리게 한다
        terms.append(f"({puzzle}) × {quantity}")

    # 재고 확인 (품절 게이트) — 부족하면 주문서를 만들지 않는다.
    # 실제 차감은 손님이 금액을 맞혀 주문이 완료될 때 한다 (agent 루프에서).
    names = {oi["menu_id"]: oi["name"] for oi in order_items}
    for menu_id, quantity in needed.items():
        remaining = stock.get(menu_id, 0)
        if remaining < quantity:
            return {"error": f"{names[menu_id]}: 재고 부족 (남은 수량 {remaining})"}

    # 실제 단가·합계 숫자는 담지 않는다 — 계산식만 준다. 정답은 check_answer가 판정.
    return {"items": order_items, "expression": " + ".join(terms)}
