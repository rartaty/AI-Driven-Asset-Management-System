# ===============================================================
# backend/Dockerfile — Project Big Tester
# ---------------------------------------------------------------
# FastAPI バックエンドの本番稼働用イメージ.
#
# 要件: A.1 (Podman + restart: always) / E.6.1 (SSM 経由シークレット動的取得)
# 関連: WAF-H8 (2026-05-18) / docker-compose.yml
#
# ベース選定: python:3.11-slim (Phase 8e + Phase 9 要件)
# Build: ~250MB (psycopg-binary + pyarrow + ML 系ライブラリ込)
# ===============================================================

FROM python:3.11-slim

# === システム依存 ===
# - build-essential: psycopg-binary が source build 必要な場合のフォールバック
# - curl + ca-certificates: AWS CLI + ヘルスチェック用
# - tzdata: JST タイムゾーン
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        ca-certificates \
        tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && ln -snf /usr/share/zoneinfo/Asia/Tokyo /etc/localtime \
    && echo "Asia/Tokyo" > /etc/timezone

ENV TZ=Asia/Tokyo \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUTF8=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# === Python 依存 ===
# requirements.txt を先にコピーして layer cache を効かせる
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# === AWS CLI v2 (SSM 取得用) ===
# entrypoint で aws ssm get-parameter を呼ぶため必要.
# x86_64 想定. ARM 環境では別途 awscli-exe-linux-aarch64.zip に差替.
RUN curl -sL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip \
    && apt-get update && apt-get install -y --no-install-recommends unzip \
    && unzip -q /tmp/awscliv2.zip -d /tmp \
    && /tmp/aws/install \
    && rm -rf /tmp/aws /tmp/awscliv2.zip \
    && apt-get purge -y unzip \
    && rm -rf /var/lib/apt/lists/*

# === アプリケーションコード ===
# .dockerignore で venv / __pycache__ / tests / data.db / .env 等は除外済
# scripts/ は project root にあり container 内不要 (alembic は python -m alembic で起動)
COPY src/ /app/src/
COPY alembic/ /app/alembic/
COPY alembic.ini /app/alembic.ini

# entrypoint script (SSM 取得 → uvicorn 起動)
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# === 実行ユーザー (非 root) ===
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# === ヘルスチェック (要件 A.1 補完) ===
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health > /dev/null || exit 1

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
