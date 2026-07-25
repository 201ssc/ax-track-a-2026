"""분식왕 주문 접수 API — /order가 에이전트 루프를 호출합니다."""

import os
from pathlib import Path

from dotenv import load_dotenv, set_key
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from agent import session
from agent.loop import run_agent
from tools.stock import reset_stock

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(ENV_PATH)

app = FastAPI(title="수학왕 퀴즈 에이전트", version="1.0.0")


class OrderRequest(BaseModel):
    message: str
    session_id: str | None = None  # 이어지는 대화면 이전 응답의 session_id를 전달


class SettingsUpdate(BaseModel):
    gemini_api_key: str | None = None
    model: str | None = None


@app.post("/order")
def order(request: OrderRequest) -> dict:
    session_id, history = session.get_history(request.session_id)
    try:
        result = run_agent(request.message, history, session_id)
    except Exception as exc:  # 시연용 — 실패 원인이 화면에 보이게 (첫 줄만)
        reason = str(exc).splitlines()[0] if str(exc) else repr(exc)
        return {
            "message": "죄송합니다, 주문 처리 중 문제가 생겼어요.",
            "error": reason,
            "session_id": session_id,
        }
    session.append(
        session_id,
        [
            {"role": "user", "content": request.message},
            {"role": "assistant", "content": result.get("message", "")},
        ],
    )
    result["session_id"] = session_id
    return result


@app.delete("/session/{session_id}")
def clear_session(session_id: str) -> dict:
    """웹의 /clear 명령 — 세션 대화 이력을 지웁니다."""
    return {"cleared": session.clear(session_id)}


@app.post("/stock/reset")
def stock_reset() -> dict:
    """웹의 /reset 명령 — 재고를 시드(data/stock.json) 상태로 되돌립니다."""
    reset_stock()
    return {"reset": True}


def _settings_view() -> dict:
    key = os.environ.get("GEMINI_API_KEY", "")
    return {
        "model": os.environ.get("MODEL", ""),
        "gemini_api_key_set": bool(key),
        "gemini_api_key_hint": f"…{key[-4:]}" if len(key) >= 8 else "",
    }


@app.get("/settings")
def get_settings() -> dict:
    return _settings_view()


@app.put("/settings")
def update_settings(update: SettingsUpdate) -> dict:
    """웹 화면의 ⚙️ 설정 저장 — .env 파일에 기록하고 즉시 적용합니다. 로컬 시연용."""
    ENV_PATH.touch(exist_ok=True)
    for env_key, value in (
        ("GEMINI_API_KEY", update.gemini_api_key),
        ("MODEL", update.model),
    ):
        if value:  # 빈 값은 기존 설정 유지
            set_key(ENV_PATH, env_key, value.strip())
            os.environ[env_key] = value.strip()
    return _settings_view()


# 웹 주문 화면 — API 라우트보다 뒤에 마운트해야 /order가 가려지지 않습니다.
# 경로는 이 파일 기준 절대 경로 — 어느 디렉터리에서 실행해도 동작합니다.
app.mount("/", StaticFiles(directory=BASE_DIR / "web", html=True), name="web")
