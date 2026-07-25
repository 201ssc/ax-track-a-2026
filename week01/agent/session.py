"""세션 메모리 — 손님별 대화 이력을 서버가 보관합니다.

에이전트 루프에 '메모리'가 붙는 첫 단계입니다. 도구 호출 왕복은 요청 안에서만
쓰고 버리며, 이력에는 손님-점원 대화(user/assistant)만 남깁니다.

인메모리 저장이므로 서버를 재시작하면 사라집니다. 만료(TTL)와 잠금(동시성)이
붙는 순간 '그냥 dict'가 아니라 관리해야 할 상태가 됩니다 — 영속화·분산은
이후 주차 주제입니다.
"""

import threading
import time
import uuid

SESSION_TTL_SECONDS = 30 * 60  # 대화가 없으면 30분 뒤 만료
MAX_HISTORY_MESSAGES = 30  # 이력 상한 — 오래된 대화부터 잘라 토큰 폭주를 막습니다

_lock = threading.Lock()  # FastAPI는 요청을 스레드로 처리하므로 저장소 접근을 잠급니다
_sessions: dict[str, dict] = {}  # session_id -> {"messages": [...], "last_active": float}


def _purge_expired(now: float) -> None:
    expired = [
        sid for sid, s in _sessions.items() if now - s["last_active"] > SESSION_TTL_SECONDS
    ]
    for sid in expired:
        del _sessions[sid]


def get_history(session_id: str | None) -> tuple[str, list[dict]]:
    """세션의 대화 이력을 돌려줍니다. 없거나 만료됐으면 새 세션을 시작합니다."""
    now = time.time()
    with _lock:
        _purge_expired(now)
        if session_id and session_id in _sessions:
            session = _sessions[session_id]
            session["last_active"] = now
            return session_id, list(session["messages"])
        new_id = uuid.uuid4().hex[:12]
        _sessions[new_id] = {"messages": [], "last_active": now}
        return new_id, []


def append(session_id: str, messages: list[dict]) -> None:
    with _lock:
        session = _sessions.get(session_id)
        if session is None:  # 응답 사이에 만료·삭제됐으면 조용히 버립니다
            return
        session["messages"].extend(messages)
        session["messages"] = session["messages"][-MAX_HISTORY_MESSAGES:]
        session["last_active"] = time.time()


def clear(session_id: str | None) -> bool:
    with _lock:
        if session_id and session_id in _sessions:
            del _sessions[session_id]
            return True
        return False


def set_pending(session_id: str, order_items: list[dict]) -> None:
    """금액 문제를 낸 '대기 주문'을 기억해 둔다 — 정답을 맞히면 이 재고를 차감한다."""
    with _lock:
        session = _sessions.get(session_id)
        if session is not None:
            session["pending"] = order_items


def pop_pending(session_id: str | None) -> list[dict] | None:
    """대기 주문을 꺼내 온다 (한 번 꺼내면 사라진다). 없으면 None."""
    with _lock:
        session = _sessions.get(session_id)
        if session is None:
            return None
        return session.pop("pending", None)
