"""채점 도구 — 손님이 말한 금액이 맞는지 코드가 계산식을 다시 계산해 판정한다.

정답 판정은 LLM이 아니라 이 코드가 한다. LLM은 문제(합계 금액)를 내고 대화할 뿐,
'맞았는지'는 반드시 check_answer가 식을 계산해 판정한다.
"""

import ast
import operator

# --- 안전한 사칙연산 평가기 — eval 금지, 화이트리스트 AST 노드만 계산한다 ---

_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
}


def _normalize(expr: str) -> str:
    """기호(× ÷ − ^)를 파이썬 연산자로 바꾸고, '=' 뒤(= ? 등)는 떼어낸다."""
    expr = expr.split("=")[0]
    return (
        expr.replace("×", "*")
        .replace("÷", "/")
        .replace("−", "-")
        .replace("^", "**")
    )


def _to_number(value: float) -> float | int:
    """정수로 떨어지는 실수는 정수로 — 13500.0 대신 13500으로 보여주기 위함."""
    return int(value) if isinstance(value, float) and value.is_integer() else value


def _eval(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _BINOPS:
        left, right = _eval(node.left), _eval(node.right)
        if isinstance(node.op, ast.Div) and right == 0:
            raise ValueError("0으로 나눌 수 없습니다")
        return _BINOPS[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -_eval(node.operand)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.UAdd):
        return _eval(node.operand)
    raise ValueError("지원하지 않는 식입니다 (사칙연산과 괄호만 됩니다)")


def evaluate(expression: str) -> float | int:
    """식 문자열을 안전하게 계산해 값을 돌려준다."""
    tree = ast.parse(_normalize(expression), mode="eval")
    return _to_number(_eval(tree))


CHECK_ANSWER_SCHEMA = {
    "type": "function",
    "function": {
        "name": "check_answer",
        "description": (
            "손님이 말한 합계 금액이 맞는지 코드가 계산식을 다시 계산해 채점한다. "
            "정답 판정은 반드시 이 도구로만 한다 — 절대 직접 암산해서 맞다/틀리다 하지 않는다. "
            "expression에는 주문서의 계산식(create_order가 준 expression)을, "
            "user_answer에는 손님이 말한 금액을 넣는다."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "채점할 계산식 (예: '4500 × 2 + 4000 × 1')",
                },
                "user_answer": {
                    "type": "number",
                    "description": "손님이 말한 합계 금액",
                },
            },
            "required": ["expression", "user_answer"],
        },
    },
}


def check_answer(expression: str, user_answer: float) -> dict:
    try:
        expected = evaluate(expression)
    except Exception as exc:
        return {"error": f"식을 계산할 수 없습니다: {exc}"}
    try:
        given = float(user_answer)
    except (TypeError, ValueError):
        return {"error": f"답이 숫자가 아닙니다: {user_answer}"}

    correct = abs(given - float(expected)) < 1e-9
    return {
        "expression": _normalize(expression).strip(),
        "user_answer": _to_number(given),
        "expected": _to_number(expected),
        "correct": correct,
    }
