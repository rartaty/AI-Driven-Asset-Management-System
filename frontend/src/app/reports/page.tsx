"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

// HYBRID-12: 損失原因分類 (ルールベース 4 種 + unknown)
type LossClassification =
  | "news_driven"
  | "strategy_flaw"
  | "market_driven"
  | "liquidity"
  | "unknown";

interface LossDetail {
  trade_id: number;
  ticker_symbol: string;
  pnl: number;
  individual_pnl_pct: number;
  nikkei_pnl_pct: number | null;
  loss_classification: LossClassification;
  evidence: string;
}

interface AIReport {
  report_id: string;
  report_type: string;
  target_date: string;
  file_path: string;
  ai_summary: string;
  loss_classifications: LossDetail[];
}

const BADGE_CLASS: Record<string, string> = {
  Daily: styles.badgeDaily,
  Monthly: styles.badgeMonthly,
  Annual: styles.badgeAnnual,
};

// HYBRID-12: 分類別の色 + 日本語ラベル
const LOSS_CLASS_LABEL: Record<LossClassification, string> = {
  news_driven: "材料起因",
  strategy_flaw: "ロジック起因",
  market_driven: "市場起因",
  liquidity: "流動性起因",
  unknown: "不明",
};

const LOSS_CLASS_COLOR: Record<LossClassification, string> = {
  news_driven: "#f59e0b",     // amber
  strategy_flaw: "#ef4444",   // red — 改善余地あり
  market_driven: "#3b82f6",   // blue — やむを得ない
  liquidity: "#a855f7",       // purple
  unknown: "#6b7280",         // gray
};

function normalizeSummaryText(text: string): string {
  return (text || "").replace(/\\n/g, "\n").trim();
}

function formatYen(value: number): string {
  return `¥${value.toLocaleString("ja-JP")}`;
}

export default function ReportsAlbum() {
  const [reports, setReports] = useState<AIReport[]>([]);
  const [loading, setLoading] = useState(true);
  // HYBRID-12: フィルタ — null=全件 / "strategy_flaw"=ロジック起因のみ
  const [filterClass, setFilterClass] = useState<LossClassification | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("http://localhost:8000/api/v1/reports")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          setReports(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to fetch reports:", err);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className={styles.loadingWrapper}>
        <div className={styles.loadingText}>Loading AI Reports...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.heading}>AI Report Album</h1>
        <p className={styles.subheading}>Review your past performance and AI-driven insights.</p>

        {/* HYBRID-12: 損失分類フィルタ */}
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            onClick={() => setFilterClass(null)}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: "0.4rem",
              border: filterClass === null ? "2px solid #fff" : "1px solid #555",
              background: filterClass === null ? "#374151" : "transparent",
              color: "#fff",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            すべて表示
          </button>
          {(Object.keys(LOSS_CLASS_LABEL) as LossClassification[]).map((cls) => (
            <button
              key={cls}
              onClick={() => setFilterClass(cls)}
              style={{
                padding: "0.4rem 0.8rem",
                borderRadius: "0.4rem",
                border:
                  filterClass === cls
                    ? `2px solid ${LOSS_CLASS_COLOR[cls]}`
                    : "1px solid #555",
                background: filterClass === cls ? LOSS_CLASS_COLOR[cls] : "transparent",
                color: "#fff",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              {LOSS_CLASS_LABEL[cls]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.grid}>
        {reports.map((report) => {
          const badge = `${styles.badge} ${BADGE_CLASS[report.report_type] ?? styles.badgeDaily}`;
          // PnL 損失額順 (負値の昇順 = 大損が先頭) でソート
          const allLosses = (report.loss_classifications ?? []).slice().sort(
            (a, b) => a.pnl - b.pnl,
          );
          const visibleLosses = filterClass
            ? allLosses.filter((d) => d.loss_classification === filterClass)
            : allLosses;
          return (
            <div key={report.report_id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardMeta}>
                  <span className={badge}>{report.report_type}</span>
                  <span className={styles.date}>
                    {new Date(report.target_date).toLocaleDateString("ja-JP", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <button className={styles.actionBtn}>View Full Details &rarr;</button>
              </div>

              <div className={styles.summaryBox}>
                <h4 className={styles.summaryLabel}>AI Summary &amp; If-Then Analysis</h4>
                <div className={styles.summaryText}>{normalizeSummaryText(report.ai_summary)}</div>
              </div>

              {/* HYBRID-12: 損失分類 list (損失額順) */}
              {allLosses.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <h4 className={styles.summaryLabel}>
                    Loss Breakdown ({allLosses.length} 件
                    {filterClass && visibleLosses.length !== allLosses.length
                      ? ` / 表示中 ${visibleLosses.length} 件`
                      : ""}
                    )
                  </h4>
                  {visibleLosses.length === 0 ? (
                    <div style={{ padding: "0.5rem", color: "#9ca3af", fontSize: "0.85rem" }}>
                      該当する損失なし
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                      {visibleLosses.map((d) => (
                        <div
                          key={d.trade_id}
                          style={{
                            padding: "0.5rem 0.7rem",
                            borderRadius: "0.4rem",
                            background: "rgba(255,255,255,0.04)",
                            borderLeft: `4px solid ${LOSS_CLASS_COLOR[d.loss_classification]}`,
                            fontSize: "0.85rem",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                            <span style={{ fontWeight: 600 }}>{d.ticker_symbol}</span>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                padding: "0.1rem 0.4rem",
                                borderRadius: "0.3rem",
                                background: LOSS_CLASS_COLOR[d.loss_classification],
                                color: "#fff",
                              }}
                            >
                              {LOSS_CLASS_LABEL[d.loss_classification]}
                            </span>
                            <span style={{ color: "#ef4444" }}>
                              {formatYen(d.pnl)} ({d.individual_pnl_pct.toFixed(2)}%)
                            </span>
                          </div>
                          <div style={{ marginTop: "0.2rem", color: "#9ca3af", fontSize: "0.75rem" }}>
                            {d.evidence}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {reports.length === 0 && (
          <div className={styles.empty}>No reports available yet.</div>
        )}
      </div>
    </div>
  );
}
