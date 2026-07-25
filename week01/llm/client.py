"""LiteLLM 래퍼 — 모든 LLM 호출은 이 모듈을 거칩니다.

프로바이더 SDK를 직접 부르지 않습니다. 모델은 환경변수 MODEL로 교체합니다 —
gemini/... 를 anthropic/... 이나 ollama/... 로 바꾸면 코드 수정 없이
다른 프로바이더로 전환됩니다.
"""

import os

import litellm
from dotenv import load_dotenv

load_dotenv()  # FastAPI 없이 단독 실행(스크립트·테스트)할 때도 .env를 읽습니다

DEFAULT_MODEL = "gemini/gemini-2.5-flash"  # .env.example의 기본값과 동일


def complete(messages: list[dict], tools: list[dict] | None = None):
    # 모델명을 호출 시점에 읽으므로, 웹 ⚙️ 설정으로 바꾼 값이 즉시 적용됩니다
    return litellm.completion(
        model=os.environ.get("MODEL") or DEFAULT_MODEL,
        messages=messages,
        tools=tools,
    )
