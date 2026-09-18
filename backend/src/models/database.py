"""
データベース接続の初期設定 (SQLAlchemy)

PostgreSQL + TimescaleDB 必須 (ADR-0014 / Phase 8e で本番採用済).
ドライバは psycopg v3 (`postgresql+psycopg://...`).

注: psycopg2 ではなく psycopg v3 を使う。理由は Windows 日本語パスで psycopg2 が
    UnicodeDecodeError 0x83 を起こす根本問題回避 (requirements.txt 参照).

接続最適化 (Phase 8e Step 8e-2 / ADR-0014):
- pool_pre_ping=True (切断検知 + 再接続)
- pool_size / max_overflow / pool_recycle (接続プール管理)
- DATABASE_ECHO=true で SQL ログ出力 (デバッグ用)
- ログにパスワードを露出しない (URL マスキング)

SQLite fallback は廃止 (2026-05-26 / ADR-0014 Status=Completed 後の整理):
- 旧版は DATABASE_URL 未設定時に backend/data.db を自動使用していたが、
  schema migration が PG とずれて整合性問題を起こすため完全廃止.
- pytest 実行は隔離 runner 経由 (disposable DB の DATABASE_URL を pre-set).
- 開発・dev でも DATABASE_URL を必ず設定する運用に切替.
"""
import logging
import os
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

logger = logging.getLogger(__name__)


# === 接続文字列の解決 (必須) ===
SQLALCHEMY_DATABASE_URL: str | None = os.getenv("DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    raise RuntimeError(
        "[DB] DATABASE_URL is required. SQLite fallback was removed (2026-05-26).\n"
        "  - pytest: use isolated disposable PostgreSQL(+TimescaleDB) runner\n"
        "  - dev/runtime: export DATABASE_URL=postgresql+psycopg://<user>:<password>@<host>:5433/projectbig\n"
        "  - PG container: scripts/start-pg.ps1"
    )

if not SQLALCHEMY_DATABASE_URL.startswith(("postgresql+psycopg://", "postgresql://")):
    raise RuntimeError(
        f"[DB] DATABASE_URL must use psycopg v3 (postgresql+psycopg://...). "
        f"Got: {SQLALCHEMY_DATABASE_URL.split('://', 1)[0]}://..."
    )

# SQL ログ出力 (デバッグ時のみ true 推奨)
_DB_ECHO: bool = os.getenv("DATABASE_ECHO", "false").lower() == "true"


def _mask_db_url(url: str) -> str:
    """接続文字列からパスワードをマスクしてログ表示用に整形する."""
    if "://" not in url or "@" not in url:
        return url
    before, after = url.split("@", 1)
    proto, creds = before.split("://", 1)
    if ":" not in creds:
        return url
    user = creds.split(":", 1)[0]
    return f"{proto}://{user}:***@{after}"


# PostgreSQL + TimescaleDB (本番・ADR-0014)
# 接続プール設定:
# - pool_pre_ping=True: 取得時に SELECT 1 で切断検知 (PG アイドル切断対策)
# - pool_size=5: 通常接続数 (本PJ単一プロセスなので少なめ)
# - max_overflow=10: バースト時の追加接続上限
# - pool_recycle=3600: 1 時間で接続再生成 (長時間アイドル防止)
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    echo=_DB_ECHO,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=3600,
)
logger.info("[DB] Using PostgreSQL: %s", _mask_db_url(SQLALCHEMY_DATABASE_URL))

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 全テーブルの親となる Base クラス
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """FastAPI の Dependency Injection 用 DB セッション取得関数."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
