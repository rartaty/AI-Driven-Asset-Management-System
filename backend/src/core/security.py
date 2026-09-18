"""
Web認証 (M4) 用モジュール
FastAPIのルーターを無断アクセスから保護するためのトークン認証機能を提供します。
"""
import logging
import os
from secrets import compare_digest

from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)
_DEV_BYPASS_LOGGED = False

# Swagger UI に "Authorize" ボタンを表示させるためのスキーム定義
# auto_error=False にして自前のロジック (dev bypass) を先に通す.
security_scheme = HTTPBearer(auto_error=False)


def _is_dev_bypass_enabled() -> bool:
    """ローカル開発時のみ admin auth を skip するためのフラグ判定.

    条件 (全部満たした時のみ True):
    - DEV_BYPASS_ADMIN_AUTH=true (環境変数)
    - TRADE_MODE != REAL (PAPER / PAPER_LIVE 限定)

    REAL モードでは絶対に bypass しない (WAF-C3 fail-closed 維持).
    """
    if os.getenv("DEV_BYPASS_ADMIN_AUTH", "false").lower() != "true":
        return False
    trade_mode = os.getenv("TRADE_MODE", "PAPER").upper()
    if trade_mode == "REAL":
        # REAL では絶対に bypass しない
        logger.error(
            "[Web] DEV_BYPASS_ADMIN_AUTH=true は REAL モードでは無視されます. "
            "本番運用では ADMIN_API_TOKEN を SSM 経由で必ず設定してください."
        )
        return False
    global _DEV_BYPASS_LOGGED
    if not _DEV_BYPASS_LOGGED:
        logger.info(
            f"[Web] DEV_BYPASS_ADMIN_AUTH=true: admin auth スキップ (TRADE_MODE={trade_mode}). "
            "REAL モードでは絶対に使用しないこと."
        )
        _DEV_BYPASS_LOGGED = True
    return True


def verify_admin_token(
    credentials: HTTPAuthorizationCredentials = Security(security_scheme),
) -> str:
    """
    リクエストヘッダの Authorization: Bearer <token> を検証します。

    ADMIN_API_TOKEN が未設定の場合は fail-closed で全リクエストを拒否する。
    ハードコードした既定値で「実質オープン」になる事故を防ぐ (要件 E.5.1)。
    本番は AWS SSM (/projectbig/admin/api-token) に登録し、load-secrets.ps1 が
    環境変数へ展開する運用 (core/secrets.py の _KEY_MAPPING 参照)。

    ローカル開発限定の便利機能として、DEV_BYPASS_ADMIN_AUTH=true +
    TRADE_MODE!=REAL のとき auth を skip する (start_paper_live.bat 用).
    REAL モードでは絶対に skip しない (fail-closed 維持).

    :param credentials: HTTPBearer が抽出した Authorization 認証情報 (なければ None)
    :return: 検証済みトークン文字列 (dev bypass 時は "DEV_BYPASS")
    :raises HTTPException: 認証ヘッダ欠落 (401) / ADMIN_API_TOKEN 未設定 (503) /
                           トークン不一致 (401)
    """
    # ローカル開発時の bypass (TRADE_MODE!=REAL 限定)
    if _is_dev_bypass_enabled():
        return "DEV_BYPASS"

    expected_token = os.getenv("ADMIN_API_TOKEN")
    if not expected_token:
        # 既定値フォールバックは廃止. 未設定は設定ミスとして安全側 (拒否) に倒す
        raise HTTPException(
            status_code=503,
            detail="[Web] ADMIN_API_TOKEN is not configured — refusing all requests",
        )

    if credentials is None:
        # auto_error=False のため、ヘッダ欠落は自前で 401 を返す
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # タイミング攻撃対策として定数時間比較を使う
    if not compare_digest(credentials.credentials, expected_token):
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return credentials.credentials
