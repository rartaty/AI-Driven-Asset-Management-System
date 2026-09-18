"""
Phase A / ADR-0022 (A-1): API rate limiter (Token Bucket).

kabu STATION 公式仕様 (kabu_STATION_API.yaml L24-34) に従い、3 系統の流量制限を
クライアント側で能動的に守る. 違反前に acquire でブロック (ベストエフォート) し、
それでも 429 が返った場合は呼出側の exponential backoff で吸収する.

公式制限:
- 発注系 (place / cancel)   : 秒間 5 件
- 取引余力系 (wallet/cash)  : 秒間 10 件
- 情報系 (positions/symbol/register/unregister/ranking etc.): 秒間 10 件

設計判断:
- Token Bucket 方式 (burst を許容しつつ平均レートを守る)
- スレッドセーフ (threading.Lock で acquire を直列化)
- env 上書き可: KABU_RATE_LIMIT_ORDER_REQ_PER_SEC 等
- KABU_RATE_LIMIT_DISABLED=true でテスト時の無効化
- consecutive 429 counter は kabucom 側で管理 (本モジュールは bucket のみ提供)

参照:
- docs/adr/0022-phase-a-safety-cost-control-baseline.md (A-1)
- backend/src/api/specs/kabu_STATION_API.yaml L24-34
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Dict

from core import app_config

logger = logging.getLogger(__name__)


# ============================================================
# Constants
# ============================================================

# bucket name → (rate_per_sec, capacity) のデフォルト. capacity は burst 許容数.
_DEFAULTS = {
    "kabu_order": (5.0, 5),     # 発注系 (秒間 5 件)
    "kabu_account": (10.0, 10),  # 取引余力系 (秒間 10 件)
    "kabu_info": (10.0, 10),     # 情報系 (秒間 10 件)
}

# env で上書き可能
def _load_config(bucket_name: str) -> tuple[float, int]:
    """env から bucket 設定を読込. 未設定なら _DEFAULTS を返す."""
    default_rate, default_capacity = _DEFAULTS[bucket_name]
    env_prefix = f"KABU_RATE_LIMIT_{bucket_name.replace('kabu_', '').upper()}"
    rate = app_config.get_float(f"{env_prefix}_REQ_PER_SEC", default_rate)
    capacity = app_config.get_int(f"{env_prefix}_CAPACITY", default_capacity)
    return rate, capacity


def _is_rate_limit_disabled() -> bool:
    """env を再評価して disable 判定. テスト時に KABU_RATE_LIMIT_DISABLED=true で acquire を即時 True 返却."""
    return os.getenv("KABU_RATE_LIMIT_DISABLED", "false").lower() == "true"


# ============================================================
# Token Bucket
# ============================================================


class TokenBucket:
    """秒間 rate_per_sec 件のレート制限を Token Bucket で実装.

    使い方:
        bucket = TokenBucket(rate_per_sec=10, capacity=10)
        if bucket.acquire(timeout_sec=5):
            # API call
        else:
            # timeout (制限を守れず諦め)

    アルゴリズム:
        - capacity 個のトークンで初期化
        - 1 秒あたり rate_per_sec 個ずつ補充 (連続時間モデル)
        - acquire(n) で n 個消費. 不足なら必要時間 sleep + 再試行
        - timeout_sec を超えても取得できなければ False 返却
    """

    def __init__(self, rate_per_sec: float, capacity: int, *, name: str = "") -> None:
        if rate_per_sec <= 0:
            raise ValueError(f"rate_per_sec must be positive: {rate_per_sec}")
        if capacity <= 0:
            raise ValueError(f"capacity must be positive: {capacity}")
        self.rate_per_sec = rate_per_sec
        self.capacity = capacity
        self.name = name
        self._tokens: float = float(capacity)
        self._last_refill = time.monotonic()
        self._lock = threading.Lock()

    def _refill(self) -> None:
        """前回 refill 以降の経過時間ぶん補充. Lock 内で呼ぶこと."""
        now = time.monotonic()
        elapsed = now - self._last_refill
        if elapsed > 0:
            self._tokens = min(self.capacity, self._tokens + elapsed * self.rate_per_sec)
            self._last_refill = now

    def acquire(self, tokens: int = 1, *, timeout_sec: float = 10.0) -> bool:
        """tokens 個のトークン取得を試みる. 不足時は補充を待つ.

        :param tokens: 取得個数 (通常 1)
        :param timeout_sec: 取得待ちタイムアウト. 超過すると False 返却
        :return: True = 取得成功 / False = timeout
        """
        if _is_rate_limit_disabled():
            return True

        if tokens > self.capacity:
            raise ValueError(
                f"requested tokens ({tokens}) exceeds bucket capacity ({self.capacity})"
            )

        deadline = time.monotonic() + timeout_sec
        while True:
            with self._lock:
                self._refill()
                if self._tokens >= tokens:
                    self._tokens -= tokens
                    return True
                # 不足. 補充までの待ち時間を計算
                deficit = tokens - self._tokens
                wait_sec = deficit / self.rate_per_sec
            # Lock を離してから sleep (他スレッドの acquire を阻害しない)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return False
            time.sleep(min(wait_sec, remaining))

    def available(self) -> float:
        """現在のトークン残量 (debug 用)."""
        with self._lock:
            self._refill()
            return self._tokens

    def reset(self) -> None:
        """capacity まで充填 + last_refill 更新 (test 用)."""
        with self._lock:
            self._tokens = float(self.capacity)
            self._last_refill = time.monotonic()


# ============================================================
# Singleton accessor
# ============================================================

_buckets: Dict[str, TokenBucket] = {}
_buckets_lock = threading.Lock()


def get_bucket(name: str) -> TokenBucket:
    """name 別のシングルトン TokenBucket を返す. 初回呼出時に env から設定読込."""
    if name not in _DEFAULTS:
        raise ValueError(f"unknown bucket name: {name} (valid: {list(_DEFAULTS.keys())})")
    with _buckets_lock:
        bucket = _buckets.get(name)
        if bucket is None:
            rate, capacity = _load_config(name)
            bucket = TokenBucket(rate, capacity, name=name)
            _buckets[name] = bucket
            logger.info(
                f"[RateLimiter] initialized bucket '{name}' rate={rate}/sec capacity={capacity}"
            )
        return bucket


def reset_all_buckets() -> None:
    """test 用: 全 bucket を捨てて次回 get_bucket で再初期化させる.

    env を monkeypatch で変えた後にこの関数を呼ぶと反映される.
    """
    with _buckets_lock:
        _buckets.clear()
