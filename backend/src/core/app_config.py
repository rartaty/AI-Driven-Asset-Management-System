"""中央環境変数アクセサ (ADR-0029 R2 / env 一元化).

⚠️ **キャッシュ禁止** (backend/AGENTS.md 規約・絶対遵守):
   全アクセサは **呼出時に os.getenv を読む**。import 時に値を固定 (キャッシュ) しない。
   理由 — (1) tests の monkeypatch / 実行時の env 変更が即反映される必要がある,
   (2) `TRADE_MODE` 等は REAL 経路が env 未設定時に到達不能でなければならない。
   したがって本モジュールは「凍結 config オブジェクト」ではなく **アクセサ関数の集約** である。

目的: 各 call site に散在する bool フラグ解析 (`.strip().lower() in ("1","true","yes","on")`
や `not in {"0","false","no","off"}`) の重複と、未認識値の扱いの微妙な揺れを 1 箇所に統一する。
int / float / str も同じ方針でパース primitive を提供する (移行は段階的)。
"""
from __future__ import annotations

import os

# bool 解釈の認識セット (小文字・strip 後)
_TRUTHY = frozenset({"1", "true", "yes", "on"})
_FALSY = frozenset({"0", "false", "no", "off"})


def get_str(name: str, default: str = "") -> str:
    """env を文字列で取得 (未設定なら default). 既存 `os.getenv(name, default)` 等価."""
    raw = os.getenv(name)
    return default if raw is None else raw


def get_bool(name: str, default: bool = False) -> bool:
    """env を bool 解釈する (呼出時読込・キャッシュなし).

    解釈規則:
      - 認識する真値 {"1","true","yes","on"} (大小無視・strip) → True
      - 認識する偽値 {"0","false","no","off"} → False
      - 未設定 (None) / 空文字 / 未認識値 → ``default``

    既存 call site との互換 (挙動同一):
      - default-OFF flag: ``get_bool(name, False)``
        ≡ ``os.getenv(name, "0"/"").strip().lower() in ("1","true","yes","on")``
        (未設定/空/未認識 → False)
      - default-ON flag : ``get_bool(name, True)``
        ≡ ``os.getenv(name, "1").strip().lower() not in {"0","false","no","off"}``
        (未設定/空/未認識 → True / 明示的 off 系のみ False)
    """
    raw = os.getenv(name)
    if raw is None:
        return default
    v = raw.strip().lower()
    if v in _TRUTHY:
        return True
    if v in _FALSY:
        return False
    return default  # 空文字・未認識値は default に倒す (= 従来の両セマンティクス再現)


def get_int(name: str, default: int) -> int:
    """env を int 解釈する. 未設定/空/パース不能 → default (例外を投げない)."""
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw.strip())
    except ValueError:
        return default


def get_float(name: str, default: float) -> float:
    """env を float 解釈する. 未設定/空/パース不能 → default (例外を投げない)."""
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw.strip())
    except ValueError:
        return default
