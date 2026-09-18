-- ===============================================================
-- docker/postgres/init.sql — Project Big Tester
-- ---------------------------------------------------------------
-- TimescaleDB 拡張の有効化 + 初期動作確認
--
-- 関連 ADR: ADR-0014 (Phase 8e PG + TimescaleDB)
-- 実行タイミング: docker-compose up -d 初回起動時のみ (公式イメージの慣例)
-- 公式イメージ timescale/timescaledb:latest-pg15 では TimescaleDB
-- 拡張のバイナリは事前インストール済み。本ファイルで CREATE EXTENSION
-- を実行することで実際に有効化される。
-- ===============================================================

-- === TimescaleDB 拡張の有効化 ===
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- === バージョン確認 (起動ログに表示) ===
SELECT
    'TimescaleDB initialized' AS status,
    extversion AS version
FROM pg_extension
WHERE extname = 'timescaledb';

-- === タイムゾーン確認 ===
SELECT current_setting('TimeZone') AS server_timezone;

-- === ロケール確認 ===
SHOW LC_COLLATE;
SHOW SERVER_ENCODING;

-- === 注意 ===
-- 本ファイルでは Hypertable やテーブル定義は作成しない。
-- 既存テーブルの移行と Hypertable 化は Phase 8e-3 以降の alembic
-- マイグレーションで行う (ADR-0014 Notes 推奨実装順序参照)。
