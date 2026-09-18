"""
Discord Webhook 通知クライアント

参照仕様:
- docs/REQUIREMENTS_DEFINITION.md §6 (異常系・エッジケース対応)
- docs/TECHNICAL_SPECIFICATION.md §5 (アラート・監視仕様)
- docs/infrastructure/DATA_FOUNDATION.md §7.2 (Discord 通知タグ規約)
- docs/adr/0003-aws-ssm-standard-tier.md (Webhook URL は SSM 経由取得)
- .claude/agents/discord-notify-validator.md (検証観点)

通知タグ規約:
- 🔴 [CRITICAL] [COMPONENT] — 致命的 (API連続失敗、Kill Switch発動、15:15決済失敗等)
- 🟡 [WARN] [COMPONENT] — 警告 (一過性エラー、見直し推奨)
- 🟢 [INFO] [COMPONENT] — 通常通知 (約定、レポート生成完了等)

設計方針 (要件 §6.5 + behaviors.md S3):
- Webhook URL は SSM Parameter Store から動的取得 (絶対禁止2 準拠)
- 送信失敗時はメイン処理をブロックせず、ログには `[Notify]` プレフィクスで残す
- HTTP タイムアウト 5 秒 (短期トレードの遅延ブロック防止)
- リトライは 1 回 (失敗時は即諦め・冪等性のため `X-Discord-Idempotency` 等の仕組みは Discord 側にないため重複送信回避優先)
"""

import logging
import os
import threading
import time
from collections import defaultdict, deque
from enum import Enum
from typing import Optional

import requests

from core import app_config
from core.secrets import get_secret


logger = logging.getLogger(__name__)


# ===== Constants =====
_HTTP_TIMEOUT_SEC = 5
_DISCORD_MAX_CONTENT_LEN = 2000  # Discord webhook content 上限


# ===== 2026-06-05: Rate limiter 恒久対策 (本日 09:19 観察した 429 事故対応) =====
# Discord webhook の公式制限: 30 req/min per webhook.
# 起動時 catchup バーストで複数 job が同一 webhook を集中的に叩くと 429.
# - 過去 60 秒の送信履歴を deque で保持し、30 件超過時は skip (drop)
# - 429 受信時は Retry-After header を logger に記録 (defer 不可・非ブロッキング)
# - 同 channel で連続 N 回 429 → DISABLE_MINUTES だけ disable (kabu と同パターン)
def _rate_limit_per_min() -> int:
    # app_config.get_int は不正値で例外を投げず default を返す (旧 try/except 等価)
    return max(1, app_config.get_int("DISCORD_RATE_LIMIT_PER_MIN", 25))


def _consecutive_429_disable_threshold() -> int:
    return max(1, app_config.get_int("DISCORD_429_DISABLE_THRESHOLD", 3))


def _disable_minutes() -> int:
    return max(1, app_config.get_int("DISCORD_DISABLE_MINUTES", 5))


# channel 別 (Webhook URL ハッシュ単位ではなく channel enum 単位で簡略化)
_send_history: dict[str, deque] = defaultdict(deque)
_consecutive_429: dict[str, int] = defaultdict(int)
_disabled_until: dict[str, float] = defaultdict(float)
_rate_limit_lock = threading.Lock()


def _is_rate_limited(channel_key: str) -> bool:
    """直近 60 秒の送信件数が上限超 or 429 disable 中なら True."""
    now = time.monotonic()
    with _rate_limit_lock:
        # disable 中チェック
        if now < _disabled_until[channel_key]:
            return True
        # 60 秒より古いエントリを drop
        history = _send_history[channel_key]
        while history and now - history[0] > 60.0:
            history.popleft()
        return len(history) >= _rate_limit_per_min()


def _reserve_send_slot(channel_key: str) -> bool:
    """Atomically reserve a Discord send slot for burst-safe rate limiting."""
    now = time.monotonic()
    with _rate_limit_lock:
        if now < _disabled_until[channel_key]:
            return False
        history = _send_history[channel_key]
        while history and now - history[0] > 60.0:
            history.popleft()
        if len(history) >= _rate_limit_per_min():
            return False
        history.append(now)
        return True


def _record_send(channel_key: str) -> None:
    """送信時刻を記録 (成功・失敗問わず)."""
    with _rate_limit_lock:
        _send_history[channel_key].append(time.monotonic())


def _parse_retry_after_sec(retry_after: Optional[str]) -> Optional[float]:
    if retry_after is None:
        return None
    try:
        seconds = float(retry_after)
    except (TypeError, ValueError):
        return None
    return seconds if seconds > 0 else None


def _record_429(channel_key: str, retry_after: Optional[str] = None) -> None:
    """429 受信時の処理. 連続 N 回で channel disable."""
    with _rate_limit_lock:
        retry_after_sec = _parse_retry_after_sec(retry_after)
        if retry_after_sec is not None:
            _disabled_until[channel_key] = max(
                _disabled_until[channel_key],
                time.monotonic() + retry_after_sec,
            )
        _consecutive_429[channel_key] += 1
        count = _consecutive_429[channel_key]
        threshold = _consecutive_429_disable_threshold()
        if count >= threshold:
            disable_sec = _disable_minutes() * 60.0
            _disabled_until[channel_key] = time.monotonic() + disable_sec
            logger.error(
                f"[Notify] Discord channel '{channel_key}' DISABLED for "
                f"{_disable_minutes()} min after {count} consecutive 429s "
                f"(retry_after={retry_after})"
            )
            _consecutive_429[channel_key] = 0  # reset for next cycle


def _reset_429(channel_key: str) -> None:
    """成功時に連続 429 カウンタを reset."""
    with _rate_limit_lock:
        if _consecutive_429[channel_key] > 0:
            _consecutive_429[channel_key] = 0


def _reset_rate_limit_state_for_tests() -> None:
    """テスト用: 全 channel の state を初期化."""
    with _rate_limit_lock:
        _send_history.clear()
        _consecutive_429.clear()
        _disabled_until.clear()


# ===== Phase A / ADR-0022: Test Safety env var =====
# DISCORD_WEBHOOK_ENABLED=false にすると全 notify_* 関数が webhook を叩かず
# 即座に True を返す (既存契約: 成功時 True / 失敗時 False).
# 隔離 runner / CI でデフォルト false 推奨. 本番は true (default).
def _is_discord_enabled() -> bool:
    """env を再評価して Discord 送信可否を返す. monkeypatch 用に関数化."""
    return os.getenv("DISCORD_WEBHOOK_ENABLED", "true").lower() == "true"


class NotifyLevel(str, Enum):
    INFO = "INFO"
    WARN = "WARN"
    CRITICAL = "CRITICAL"


class DiscordChannel(str, Enum):
    """通知チャンネル区分。SSM パス `/projectbig/discord/webhook-{value}` に対応"""
    TRADING = "trading"      # Trading Reports — 約定成功・失敗等の取引イベント
    SYSTEM = "system"        # System Notifications — システム起動・起動失敗等
    ALERTS = "alerts"        # Troubles Notifications — あらゆる障害 (Kill Switch / API 連続失敗等)
    ANALYSIS = "analysis"    # Analysis Reports — 1 日まとめレポート完成時の報告 (2026-05-18 追加)


_LEVEL_EMOJI = {
    NotifyLevel.INFO: "🟢",
    NotifyLevel.WARN: "🟡",
    NotifyLevel.CRITICAL: "🔴",
}


def _build_message(message: str, component: str, level: NotifyLevel) -> str:
    """通知本文を整形 (絵文字 + [LEVEL] + [COMPONENT] プレフィクス付与)。"""
    emoji = _LEVEL_EMOJI[level]
    formatted = f"{emoji} [{level.value}] [{component}] {message}"
    if len(formatted) > _DISCORD_MAX_CONTENT_LEN:
        formatted = formatted[: _DISCORD_MAX_CONTENT_LEN - 20] + "...(truncated)"
    return formatted


def _resolve_webhook_url(channel: DiscordChannel) -> Optional[str]:
    """SSM から該当チャンネルの Webhook URL を取得。失敗時は None を返し非ブロッキング。"""
    key_mapping = {
        DiscordChannel.TRADING: "DISCORD_WEBHOOK_TRADING",
        DiscordChannel.SYSTEM: "DISCORD_WEBHOOK_SYSTEM",
        DiscordChannel.ALERTS: "DISCORD_WEBHOOK_ALERTS",
        DiscordChannel.ANALYSIS: "DISCORD_WEBHOOK_ANALYSIS",
    }
    logical_key = key_mapping.get(channel)
    if not logical_key:
        return None

    try:
        return get_secret(logical_key)
    except Exception as e:
        logger.error(f"[Notify] failed to resolve webhook URL for {channel.value}: {e}")
        return None


def notify(
    message: str,
    component: str,
    level: NotifyLevel = NotifyLevel.INFO,
    channel: DiscordChannel = DiscordChannel.SYSTEM,
) -> bool:
    """
    Discord Webhook へ通知を送信する (非ブロッキング設計)。

    :param message: 通知本文
    :param component: 発生源コンポーネント (例: "DB", "API:Kabucom", "KillSwitch")
    :param level: 通知レベル (INFO / WARN / CRITICAL)
    :param channel: 送信先チャンネル区分
    :return: 送信成功なら True、失敗なら False (例外は伝播させない)

    フォーマット例: "🔴 [CRITICAL] [API:Kabucom] kabuステーションAPI 連続3回タイムアウト"

    エラー処理: Webhook 送信失敗してもメイン処理をブロックせず、ログに [Notify] プレフィクスで記録。

    Phase A / ADR-0022: DISCORD_WEBHOOK_ENABLED=false の時は webhook を叩かず True 返却.
    """
    # Phase A / ADR-0022: テスト安全 — webhook 送信スキップ
    if not _is_discord_enabled():
        logger.info(
            f"[Notify] skipped (DISCORD_WEBHOOK_ENABLED=false) "
            f"channel={channel.value} component={component}"
        )
        return True

    # 2026-06-05: Rate limiter (本日 09:19 429 観察を契機に恒久対策).
    channel_key = channel.value
    if not _reserve_send_slot(channel_key):
        logger.warning(
            f"[Notify] Discord channel '{channel_key}' rate limited "
            f"(component={component}) - drop"
        )
        return False

    formatted = _build_message(message, component, level)

    webhook_url = _resolve_webhook_url(channel)
    if webhook_url is None:
        return False

    try:
        response = requests.post(
            webhook_url,
            json={"content": formatted},
            timeout=_HTTP_TIMEOUT_SEC,
        )
        # 429 は raise_for_status() 前に Retry-After を吸う
        if response.status_code == 429:
            retry_after = response.headers.get("Retry-After")
            logger.error(
                f"[Notify] Discord 429 channel={channel_key} "
                f"retry_after={retry_after} component={component}"
            )
            _record_429(channel_key, retry_after)
            return False
        response.raise_for_status()
        _reset_429(channel_key)
        return True
    except requests.RequestException as e:
        logger.error(f"[Notify] Discord webhook send failed (channel={channel.value}): {e}")
        return False
    except Exception as e:
        # 想定外の例外もメインを止めない
        logger.error(f"[Notify] unexpected error during Discord send (channel={channel.value}): {e}")
        return False


# ===== Convenience helpers (高頻度ユースケース向けショートカット) =====

def notify_critical(message: str, component: str) -> bool:
    """致命的イベント通知 (alerts チャンネル固定)。Kill Switch 発動・大損失等で使用。"""
    return notify(message, component, NotifyLevel.CRITICAL, DiscordChannel.ALERTS)


def notify_trade(message: str, component: str = "Trade") -> bool:
    """約定・取引イベント通知 (trading チャンネル固定)。"""
    return notify(message, component, NotifyLevel.INFO, DiscordChannel.TRADING)


def notify_system(message: str, component: str, level: NotifyLevel = NotifyLevel.INFO) -> bool:
    """通常システム通知 (system チャンネル固定)。"""
    return notify(message, component, level, DiscordChannel.SYSTEM)


def notify_analysis(message: str, component: str = "Analysis") -> bool:
    """日次/週次/月次レポート完成通知 (analysis チャンネル固定・2026-05-18 追加)。

    用途: scheduler.job_generate_ai_report 完了時 / postmortem_reporter (Phase 9 Tier 3).
    レベルは INFO 固定 (Analysis Reports はエラーではない).
    """
    return notify(message, component, NotifyLevel.INFO, DiscordChannel.ANALYSIS)
