"""메뉴 검색 — data/menu.json에서 이름·카테고리로 조회합니다."""

import json
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "menu.json"

SCHEMA = {
    "type": "function",
    "function": {
        "name": "search_menu",
        "description": (
            "메뉴판에서 메뉴를 검색한다. 이름 또는 카테고리"
            "(김밥/떡볶이/분식/면/식사/음료)의 일부로 찾는다. "
            "검색어를 생략하면 전체 메뉴판을 반환한다 — 손님이 메뉴판을 보여달라고 하면 생략하고 호출한다. "
            "손님이 말한 메뉴가 있는지, 가격과 옵션이 무엇인지 반드시 이 도구로 확인한다."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "검색어 (예: '참치김밥', '라면'). 생략하면 전체 메뉴 반환",
                }
            },
            "required": [],
        },
    },
}


def load_menu() -> list[dict]:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


# 이 검색어들은 "메뉴판 전체"를 뜻합니다 — 모델이 어떤 표현으로 부르든 받아줍니다
FULL_MENU_QUERIES = {"", "메뉴", "메뉴판", "전체", "전체 메뉴", "전체메뉴", "all", "menu"}


def search_menu(query: str = "") -> dict:
    menu = load_menu()
    q = (query or "").strip().lower()
    if q in FULL_MENU_QUERIES:  # 메뉴판 전체 — board 플래그로 표시
        return {"found": True, "board": True, "results": menu}
    results = [
        item
        for item in menu
        if q in item["name"].lower() or q in item["category"].lower()
    ]
    if results:
        return {"found": True, "results": results}
    # 못 찾으면 전체 메뉴를 돌려줘, 모델이 대안을 제시할 수 있게 합니다
    return {
        "found": False,
        "results": [],
        "all_menu": [{"id": m["id"], "name": m["name"], "price": m["price"]} for m in menu],
    }
