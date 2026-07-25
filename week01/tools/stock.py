"""재고 확인·차감 — 시드는 읽기 전용, 런타임 상태는 별도 파일에 기록합니다.

data/stock.json은 커밋된 초기 재고(시드)로 런타임에 절대 쓰지 않습니다.
차감된 현재 재고는 gitignore된 data/stock.state.json에 쌓입니다 —
상태 파일이 없으면 시드에서 시작하고, 지우면 초기화됩니다.
"""

import json
import threading
from pathlib import Path

from tools.menu import load_menu

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SEED_PATH = _DATA_DIR / "stock.json"  # 초기 재고 (커밋됨, 읽기 전용)
STATE_PATH = _DATA_DIR / "stock.state.json"  # 런타임 재고 (gitignore)

# 재고의 읽기-수정-쓰기를 잠급니다 — 동시 주문이 같은 재고를 두 번 가져가지 못하게
_lock = threading.Lock()

SCHEMA = {
    "type": "function",
    "function": {
        "name": "check_stock",
        "description": (
            "메뉴의 남은 재고를 확인하고 요청 수량만큼 주문 가능한지 알려준다. "
            "주문서를 만들기 전에 반드시 확인한다. "
            "menu_id를 생략하면 전체 메뉴의 재고 목록을 반환한다 — 손님이 재고 현황을 물으면 생략하고 호출한다."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "menu_id": {
                    "type": "string",
                    "description": "메뉴 id (search_menu 결과의 id). 생략하면 전체 재고 반환",
                },
                "quantity": {"type": "integer", "description": "주문 수량 (생략 시 1)"},
            },
            "required": [],
        },
    },
}


def load_stock() -> dict:
    path = STATE_PATH if STATE_PATH.exists() else SEED_PATH
    return json.loads(path.read_text(encoding="utf-8"))


def save_stock(stock: dict) -> None:
    STATE_PATH.write_text(
        json.dumps(stock, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def reset_stock() -> None:
    """런타임 상태를 버리고 시드 재고로 되돌립니다."""
    with _lock:
        STATE_PATH.unlink(missing_ok=True)


def deduct_stock(entries: list[dict]) -> dict | None:
    """주문 항목({menu_id, name, quantity})의 재고를 원자적으로 차감합니다.

    전 항목을 먼저 검증하고, 하나라도 부족하면 아무것도 차감하지 않고
    error를 돌려줍니다. 성공하면 None을 돌려주고 파일에 기록합니다.
    """
    needed: dict[str, int] = {}  # 같은 메뉴가 여러 줄로 와도 합산해 검증
    names: dict[str, str] = {}
    for entry in entries:
        needed[entry["menu_id"]] = needed.get(entry["menu_id"], 0) + entry["quantity"]
        names[entry["menu_id"]] = entry["name"]

    with _lock:
        stock = load_stock()
        for menu_id, quantity in needed.items():
            remaining = stock.get(menu_id, 0)
            if remaining < quantity:
                return {"error": f"{names[menu_id]}: 재고 부족 (남은 수량 {remaining})"}
        for menu_id, quantity in needed.items():
            stock[menu_id] -= quantity
        save_stock(stock)
    return None


def check_stock(menu_id: str = "", quantity: int = 1) -> dict:
    stock = load_stock()
    if not menu_id:  # 전체 재고 현황
        names = {m["id"]: m["name"] for m in load_menu()}
        return {
            "stock": [
                {"menu_id": mid, "name": names.get(mid, mid), "remaining": remaining}
                for mid, remaining in stock.items()
            ]
        }
    if menu_id not in stock:
        return {"error": f"재고 정보에 없는 메뉴 id: {menu_id}"}
    remaining = stock[menu_id]
    return {
        "menu_id": menu_id,
        "requested": quantity,
        "remaining": remaining,
        "available": remaining >= quantity,
    }
