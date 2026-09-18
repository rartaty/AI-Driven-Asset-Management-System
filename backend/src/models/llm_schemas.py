"""
LLM 入出力用 Pydantic スキーマ — Phase 9 / Tier 1 + Tier 3

SQLAlchemy ORM (models/schema.py) とは別系統。LLM の Structured Output 機能
(google-genai response_schema / openai text_format) に渡す Pydantic クラスと、
caller ↔ AIScreener 間の入出力契約を定義する.

参照:
- backend/src/prompts/market_context_summary.md (Tier 1 出力スキーマ仕様)
- docs/adr/0016-phase9-scope-ai-stock-selection.md §150-200 (MECE 4軸21分類)
- docs/adr/0018-ai-model-split-gpt-gemini.md (モデル選定)
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


# ============================================================
# Input contract: caller → AIScreener
# ============================================================


class CandidateStock(BaseModel):
    """ステップ 2 ルールベース粗絞りで残った銘柄 1 件分 (Tier 1 LLM 入力候補)."""

    code: str  # 例: "7203"
    name: str  # 例: "トヨタ自動車"
    sector: str | None = None
    note: str | None = None  # 例: "hot_sector / TDnet open / RSI<25"


class CandidateUniverse(BaseModel):
    """Tier 1 LLM への全入力 (caller 側 data aggregator が構築).

    本 MVP では caller (テスト or 将来の data_aggregator.py) が組み立てて注入する.
    各サマリは LLM プロンプトの対応する `{{var}}` プレースホルダに埋め込まれる.
    """

    candidate_stocks: list[CandidateStock]  # 通常 ~300 件 (ステップ 2 出力)
    macro_indicators_summary: str = ""
    volatility_summary: str = ""
    sector_indices_summary: str = ""
    trades_spec_summary: str = ""
    tdnet_disclosures_summary: str = ""
    rss_news_summary: str = ""
    price_technical_summary: str = ""
    data_sources_used: list[str] = Field(default_factory=list)


# ============================================================
# LLM output schemas — Tier 1
#   prompts/market_context_summary.md expected_output_schema と対応
# ============================================================


class HotSector(BaseModel):
    """セクター強弱情報 (hot_sectors / weak_sectors 両用)."""

    name: str  # 例: "半導体"
    code: str | None = None  # J-Quants コード (任意)
    strength_score: float  # -1.0 〜 +1.0 (絶対値が大きいほど強い)
    reasoning: str | None = None


# MECE 21 サブカテゴリ完全列挙 (ADR-0016)
_VALID_SUB_TRIGGERS = frozenset(
    {f"A{i}" for i in range(1, 5)}    # A1-A4 テーマ・資金循環主導
    | {f"B{i}" for i in range(1, 7)}  # B1-B6 個別材料・イベント主導
    | {f"C{i}" for i in range(1, 7)}  # C1-C6 テクニカル・需給構造主導
    | {f"D{i}" for i in range(1, 6)}  # D1-D5 マクロ・外部環境主導
)


class StockPick(BaseModel):
    """MECE 4軸21分類で picked された銘柄 1 件 (Tier 1 LLM 出力)."""

    code: str
    name: str
    primary_trigger: Literal["A", "B", "C", "D"]
    sub_trigger: str  # "A1" - "D5" (post-validate)
    themes: list[str] = Field(default_factory=list)
    theme_role: Literal["leader", "laggard", "associated"] | None = None
    material_summary: str | None = None
    base_score: float
    boost_factor: float = 1.0
    final_score: float
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str | None = None
    data_sources: list[str] = Field(default_factory=list)

    @field_validator("sub_trigger")
    @classmethod
    def _validate_sub_trigger(cls, v: str) -> str:
        if v not in _VALID_SUB_TRIGGERS:
            raise ValueError(
                f"sub_trigger {v!r} not in MECE 21 sub-categories "
                f"(A1-A4 / B1-B6 / C1-C6 / D1-D5)"
            )
        return v


class MarketContextSummary(BaseModel):
    """Tier 1 朝バッチの完全出力 (LLM 分析 + メタ情報).

    注意: 以下のメタ情報フィールドは LLM 出力後に AIScreener が真の値で上書きする
    (LLM は推測値を出すが、最終結果としては保証される):
    - snapshot_at  (実時刻)
    - snapshot_type, target_date  (caller から渡された値)
    - llm_model  (model_id)
    - llm_tokens_used  (TokenUsage 由来)
    - data_sources  (universe.data_sources_used 由来)
    """

    snapshot_at: datetime
    snapshot_type: Literal["morning_batch", "post_open"]
    target_date: date
    macro_context: str
    market_regime: Literal["trend_day", "range_day", "uncertain"]
    hot_sectors: list[HotSector] = Field(default_factory=list)
    weak_sectors: list[HotSector] = Field(default_factory=list)
    stock_picks: list[StockPick] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    # Metadata (AIScreener が post-LLM で上書き)
    llm_model: str = ""
    llm_tokens_used: int = 0
    data_sources: list[str] = Field(default_factory=list)


# ============================================================
# Result wrapper: AIScreener → caller
# ============================================================


class ScreeningResult(BaseModel):
    """run_morning_batch の戻り値."""

    summary_id: int  # DB の market_context_summary.id
    summary: MarketContextSummary
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    picks_clipped_count: int = 0  # trigger 別上限で削った件数
