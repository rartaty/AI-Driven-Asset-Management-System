"""
Cloud LLM コストガード — Phase 9 / AI-10

OpenAI + Gemini の月次合計請求額を SSM で設定した上限 (デフォルト 1500 円) 以下に
押さえ、超過時は LLM 呼出を物理ブロックする。

責務:
- per-call トークン → 推定円コスト変換 (pricing 表は SSM JSON で更新可能)
- DB `llm_usage_log` テーブルへの 1 呼出 1 行記録
- 月次合計 (`WHERE timestamp >= 月初 JST` で SUM) のリアルタイム取得
- 呼出前: `check_cap_or_raise()` で超過なら `LLMCostCapExceeded` を raise
- 呼出後: `record_usage()` で記録 + 80% 警告 / 100% CRITICAL Discord 通知

SSM (任意・未設定なら code 内 default):
- /projectbig/cost/monthly-cap-jpy            : str e.g. "1500"
- /projectbig/cost/pricing-jpy-per-1m-tokens  : JSON e.g. '{"gemini-3.5-flash": {"input":11,"output":45}, ...}'

Fail-safe 設計:
- SSM cap 取得失敗 → default 1500 + warn log (コストガード自体は止めない)
- SSM pricing 取得失敗 → hardcoded default + warn log
- DB 集計失敗 → spend=0 を返し fail-open (LLM 呼出を通す。DB 復旧待ち)
- DB 記録失敗 → log のみ. raise しない (LLM 呼出は成功済)

参照:
- docs/REQUIREMENTS_DEFINITION.md §6 (異常系)
- backend/src/core/llm_client.py (組込先)
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Callable, Optional

from sqlalchemy import func, select

from core import app_config
from core.discord import NotifyLevel, notify_critical, notify_system
from core.secrets import get_secret
from models.database import SessionLocal
from models.schema import LLM_Usage_Log

logger = logging.getLogger(__name__)


# ============================================================
# Constants & defaults
# ============================================================

_JST = timezone(timedelta(hours=9))

# Hardcoded fallbacks (SSM 未登録時 / Q1: SSM 登録は後で)
_DEFAULT_CAP_JPY: float = 1500.0

# 推定 pricing (公式 pricing 確認後に SSM JSON で更新可能・USD/JPY 150 円換算の暫定値).
# - gemini-3.5-flash: ~$0.075 / $0.30 per 1M tokens
# - gpt-5.5:          ~$3.00 / $12.00 per 1M tokens (推定・要確認)
# - _fallback:        未知モデルは保守的に高め
_DEFAULT_PRICING_JPY_PER_1M: dict[str, dict[str, float]] = {
    "gemini-3.5-flash": {"input": 11.0, "output": 45.0},
    "gpt-5.5": {"input": 450.0, "output": 1800.0},
    "_fallback": {"input": 500.0, "output": 2000.0},
}

# 80% で WARN 通知 (1 日 1 回まで・spam 防止)
_WARN_THRESHOLD: float = 0.80

# secrets.py logical keys
_SSM_KEY_CAP: str = "COST_MONTHLY_CAP_JPY"
_SSM_KEY_PRICING: str = "COST_PRICING_JPY_PER_1M_TOKENS"


def _is_optional_secret_not_registered(exc: Exception) -> bool:
    message = str(exc)
    return "ParameterNotFound" in message or "not registered" in message or "cached not-found" in message


# ============================================================
# Data class
# ============================================================


@dataclass
class CostStatus:
    """現在のコスト状況スナップショット."""

    cap_jpy: float
    spend_jpy: float
    usage_ratio: float  # 0.0 〜 ∞
    is_over_cap: bool
    is_warn_threshold: bool  # 80% 以上


# ============================================================
# CostGuard
# ============================================================


class CostGuard:
    """月次コストキャップを強制する gate.

    LLMClient が呼出前後で本クラスのメソッドを叩く。設定値 (cap, pricing) は
    init で lazy キャッシュ、`reload()` で再読込可能。
    """

    def __init__(self, session_factory: Callable | None = None) -> None:
        self.session_factory = session_factory or SessionLocal
        self._cap_jpy_cached: float | None = None
        self._pricing_cached: dict | None = None
        self._last_warn_date: date | None = None  # spam 防止
        self._lock = threading.Lock()

    # --------------------------------------------------------
    # SSM config loading (lazy + cached)
    # --------------------------------------------------------

    def _load_cap_jpy(self) -> float:
        try:
            raw = get_secret(_SSM_KEY_CAP)
            return float(str(raw).strip())
        except Exception as e:
            if _is_optional_secret_not_registered(e):
                logger.info(
                    f"[CostGuard] cap SSM value not registered; using default {_DEFAULT_CAP_JPY} JPY"
                )
                return _DEFAULT_CAP_JPY
            logger.warning(
                f"[CostGuard] cap load failed (using default {_DEFAULT_CAP_JPY} JPY): {e}"
            )
            return _DEFAULT_CAP_JPY

    def _load_pricing(self) -> dict:
        try:
            raw = get_secret(_SSM_KEY_PRICING)
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ValueError("pricing JSON must be an object")
            return data
        except Exception as e:
            if _is_optional_secret_not_registered(e):
                logger.info(
                    "[CostGuard] pricing SSM value not registered; using hardcoded defaults"
                )
                return dict(_DEFAULT_PRICING_JPY_PER_1M)
            logger.warning(
                f"[CostGuard] pricing load failed (using hardcoded defaults): {e}"
            )
            return dict(_DEFAULT_PRICING_JPY_PER_1M)

    def get_cap_jpy(self) -> float:
        with self._lock:
            if self._cap_jpy_cached is None:
                self._cap_jpy_cached = self._load_cap_jpy()
            return self._cap_jpy_cached

    def get_pricing(self) -> dict:
        with self._lock:
            if self._pricing_cached is None:
                self._pricing_cached = self._load_pricing()
            return self._pricing_cached

    def reload(self) -> None:
        """config (cap + pricing) を再読込. SSM 値更新後に呼ぶ."""
        with self._lock:
            self._cap_jpy_cached = None
            self._pricing_cached = None
            self._last_warn_date = None

    # --------------------------------------------------------
    # Cost estimation
    # --------------------------------------------------------

    def estimate_cost_jpy(
        self,
        *,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
    ) -> float:
        """1 呼出ぶんの推定コスト (円). 未知モデルは _fallback rate."""
        pricing = self.get_pricing()
        rates = pricing.get(model) or pricing.get("_fallback") or _DEFAULT_PRICING_JPY_PER_1M["_fallback"]
        try:
            input_rate = float(rates.get("input", 0))
            output_rate = float(rates.get("output", 0))
        except (TypeError, ValueError):
            input_rate = 0.0
            output_rate = 0.0
        input_jpy = input_rate * max(prompt_tokens, 0) / 1_000_000.0
        output_jpy = output_rate * max(completion_tokens, 0) / 1_000_000.0
        return input_jpy + output_jpy

    # --------------------------------------------------------
    # Monthly spend aggregation
    # --------------------------------------------------------

    def _month_start_jst(self) -> datetime:
        now = datetime.now(_JST)
        return datetime(now.year, now.month, 1, tzinfo=_JST)

    def current_month_spend_jpy(self) -> float:
        """当月累計支出 (JST 月初 00:00 以降の SUM)."""
        try:
            with self.session_factory() as session:
                stmt = select(func.coalesce(func.sum(LLM_Usage_Log.cost_jpy), 0.0)).where(
                    LLM_Usage_Log.timestamp >= self._month_start_jst()
                )
                result = session.execute(stmt).scalar() or 0.0
                return float(result)
        except Exception as e:
            logger.error(f"[CostGuard] DB spend query failed (fail-open spend=0): {e}")
            return 0.0

    def get_status(self) -> CostStatus:
        cap = self.get_cap_jpy()
        spend = self.current_month_spend_jpy()
        ratio = (spend / cap) if cap > 0 else 0.0
        return CostStatus(
            cap_jpy=cap,
            spend_jpy=spend,
            usage_ratio=ratio,
            is_over_cap=spend > cap,
            is_warn_threshold=spend > cap * _WARN_THRESHOLD,
        )

    # --------------------------------------------------------
    # Pre-call gate
    # --------------------------------------------------------

    def check_cap_or_raise(self, provider: Optional[str] = None) -> None:
        """月次コスト + 日次呼出回数の cap を超過なら LLMCostCapExceeded を raise.

        LLMClient が呼出前に実行する.

        2026-06-03: 日次 provider 別呼出回数 cap を追加.
        - env `GEMINI_DAILY_CALL_CAP` (default 30): Gemini 1 日呼出上限
        - env `OPENAI_DAILY_CALL_CAP` (default 30): OpenAI 1 日呼出上限
        - 0 を指定すると当該 provider の日次 cap 無効化 (旧挙動)
        - 月次コスト cap (¥1500) との二重防御
        - 動機: backend 再起動 catchup での重複 Gemini 呼出が GCP 課金急増の主因
        """
        # 1. 月次コスト cap (既存)
        status = self.get_status()
        if status.is_over_cap:
            msg = (
                f"[LLM:CostGuard] 月次コスト上限 {status.cap_jpy:.0f} 円を超過しました "
                f"(消費={status.spend_jpy:.2f} 円, 使用率={status.usage_ratio:.1%})。"
                f"翌月まで LLM 呼出をブロックします。"
            )
            try:
                notify_critical(msg, component="LLM:CostGuard")
            except Exception as e:
                logger.error(f"[Notify] Discord critical send failed: {e}")
            # lazy import で circular 回避
            from core.llm_client import LLMCostCapExceeded
            raise LLMCostCapExceeded(msg)

        # 2. 日次 provider 別呼出回数 cap (2026-06-03 追加)
        if provider:
            self._check_daily_call_cap_or_raise(provider)

    def _check_daily_call_cap_or_raise(self, provider: str) -> None:
        env_key = f"{provider.upper()}_DAILY_CALL_CAP"
        cap = app_config.get_int(env_key, 30)
        if cap <= 0:
            return  # 無効化
        try:
            count = self._today_call_count(provider)
        except Exception as e:
            logger.warning(f"[CostGuard] daily call count query failed (fail-open): {e}")
            return
        if count >= cap:
            msg = (
                f"[LLM:CostGuard] {provider} の日次呼出上限 {cap} 回を超過しました "
                f"(本日呼出={count} 回)。翌日 00:00 JST までブロックします。"
            )
            try:
                notify_critical(msg, component=f"LLM:CostGuard:{provider}")
            except Exception as e:
                logger.error(f"[Notify] Discord critical send failed: {e}")
            from core.llm_client import LLMCostCapExceeded
            raise LLMCostCapExceeded(msg)

    def _today_call_count(self, provider: str) -> int:
        """JST 当日 0:00 以降の LLM_Usage_Log 件数 (provider フィルタ)."""
        from sqlalchemy import func as _sql_func
        today_start = self._jst_today_start_utc()
        with self.session_factory() as session:
            stmt = (
                select(_sql_func.count(LLM_Usage_Log.id))
                .where(LLM_Usage_Log.provider == provider)
                .where(LLM_Usage_Log.timestamp >= today_start)
            )
            result = session.execute(stmt).scalar() or 0
            return int(result)

    @staticmethod
    def _jst_today_start_utc() -> datetime:
        now_jst = datetime.now(_JST)
        jst_today_0 = datetime(now_jst.year, now_jst.month, now_jst.day, tzinfo=_JST)
        return jst_today_0.astimezone(timezone.utc)

    # --------------------------------------------------------
    # Post-call recording
    # --------------------------------------------------------

    def record_usage(
        self,
        *,
        provider: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        latency_ms: int,
        prompt_version: str | None = None,
        input_hash: str | None = None,
        output_json: dict | None = None,
    ) -> float:
        """LLM 呼出 1 件を DB に記録し推定コスト (円) を返す.

        記録後に当月累計が 80% を超えていれば WARN 通知 (1 日 1 回・spam 防止).
        100% 超過は次回の check_cap_or_raise で検出される (本メソッドでは raise しない).

        Phase A / ADR-0022 (A-2): audit log 拡張引数:
            prompt_version: プロンプトテンプレート version (例 'tier1_morning_v1')
            input_hash: SHA256 of (prompt + input data) - 同じ入力での再現可否担保
            output_json: LLM raw 出力 (Pydantic dump 後の dict)
        """
        cost_jpy = self.estimate_cost_jpy(
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )

        # DB 記録 (失敗しても raise しない・LLM 呼出は既に成功済)
        try:
            with self.session_factory() as session:
                session.add(
                    LLM_Usage_Log(
                        provider=provider,
                        model=model,
                        prompt_tokens=max(prompt_tokens, 0),
                        completion_tokens=max(completion_tokens, 0),
                        total_tokens=max(prompt_tokens, 0) + max(completion_tokens, 0),
                        cost_jpy=cost_jpy,
                        latency_ms=max(latency_ms, 0),
                        prompt_version=prompt_version,
                        input_hash=input_hash,
                        output_json=output_json,
                    )
                )
                session.commit()
        except Exception as e:
            logger.error(f"[CostGuard] failed to record usage (cost tracking lost): {e}")
            return cost_jpy

        # 80% 警告判定 (記録後の最新合計でチェック)
        try:
            status = self.get_status()
            today_jst = datetime.now(_JST).date()
            if status.is_warn_threshold and not status.is_over_cap:
                if self._last_warn_date != today_jst:
                    self._last_warn_date = today_jst
                    msg = (
                        f"LLM コストが上限 {status.cap_jpy:.0f} 円の {status.usage_ratio:.0%} に到達 "
                        f"(消費={status.spend_jpy:.2f} 円)"
                    )
                    try:
                        notify_system(msg, component="LLM:CostGuard", level=NotifyLevel.WARN)
                    except Exception as ne:
                        logger.error(f"[Notify] Discord WARN send failed: {ne}")
        except Exception as e:
            logger.error(f"[CostGuard] post-record threshold check failed: {e}")

        return cost_jpy



# ===== Module-level singleton =====
# AIScreener / LLMClient が trigger ごとに new されるため、CostGuard も毎回 new されると
# 毎回 SSM 呼出 + WARNING ログが発生する. プロセス内で共有することで:
# (1) 月次 cap の to-date 集計を一貫させる (LLMClient インスタンス間で共有)
# (2) WARNING ログを 1 プロセス 1 回に抑える (cap / pricing 各 1 件のみ)
_cost_guard_singleton: CostGuard | None = None


def get_cost_guard() -> CostGuard:
    """プロセス共有の CostGuard を返す (lazy 初期化)."""
    global _cost_guard_singleton
    if _cost_guard_singleton is None:
        _cost_guard_singleton = CostGuard()
    return _cost_guard_singleton


def reset_cost_guard_singleton() -> None:
    """テスト用: singleton をリセット."""
    global _cost_guard_singleton
    _cost_guard_singleton = None
