"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

interface SectorEntry {
  name?: string;
  code?: string;
  strength_score?: number;
  reasoning?: string;
}

interface SummaryRow {
  id: number;
  snapshot_at: string | null;
  snapshot_type: string;
  target_date: string | null;
  market_regime: string | null;
  confidence: number | null;
  llm_model: string | null;
  llm_tokens_used: number | null;
  data_sources: string[];
  hot_sectors: SectorEntry[];
  weak_sectors: SectorEntry[];
  macro_context: string | null;
  pick_count: number;
}

interface PickRow {
  id: number;
  code: string;
  name: string;
  primary_trigger: string | null;
  sub_trigger: string;
  themes: string[];
  theme_role: string | null;
  material_summary: string | null;
  base_score: number;
  boost_factor: number;
  final_score: number;
  confidence: number;
  reasoning: string | null;
}

interface DetailResponse {
  summary: SummaryRow;
  picks: PickRow[];
}

const TRIGGER_LABEL: Record<string, string> = {
  A: "A テーマ主導",
  B: "B 個別材料",
  C: "C テクニカル需給",
  D: "D マクロ",
};

const TRIGGER_BADGE: Record<string, string> = {
  A: styles.triggerA,
  B: styles.triggerB,
  C: styles.triggerC,
  D: styles.triggerD,
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}

export default function AnalyticsPage() {
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetch("http://localhost:8000/api/v1/analytics/screening/summaries")
      .then((r) => r.json())
      .then((json) => {
        const rows: SummaryRow[] = json.summaries || [];
        setSummaries(rows);
        if (rows.length > 0) {
          setSelectedId(rows[0].id);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch screening summaries:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (selectedId === null) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setDetail(null);
        }
      });
      return;
    }
    Promise.resolve()
      .then(() => {
        if (!cancelled) {
          setDetailLoading(true);
        }
        return fetch(
          `http://localhost:8000/api/v1/analytics/screening/summaries/${selectedId}`,
        );
      })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          setDetail(json);
          setDetailLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch detail:", err);
        if (!cancelled) {
          setDetail(null);
          setDetailLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (loading) {
    return (
      <div className={styles.loadingWrapper}>
        <div className={styles.loadingText}>Loading Screening Analytics...</div>
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.heading}>Screening Analytics</h1>
          <p className={styles.subheading}>
            Tier 1 朝バッチ (Gemini) の銘柄選定結果
          </p>
        </div>
        <div className={`${styles.emptyCard} glass-card`}>
          <p className={styles.emptyText}>
            まだスクリーニング結果がありません。
          </p>
          <p className={styles.emptyHint}>
            平日 08:30 JST に Tier 1 朝バッチが自動実行されます。
            <br />
            手動 trigger: <code>POST /api/v1/system/trigger/morning_screening</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Screening Analytics</h1>
        <p className={styles.subheading}>
          Tier 1 朝バッチ (Gemini) の銘柄選定結果と分析
        </p>
      </div>

      <div className={styles.layout}>
        {/* Left: Summary list */}
        <aside className={`${styles.summaryList} glass-card`}>
          <h3 className={styles.sectionTitle}>Recent Snapshots</h3>
          <ul className={styles.snapshotUl}>
            {summaries.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setSelectedId(s.id)}
                  className={`${styles.snapshotBtn} ${
                    selectedId === s.id ? styles.snapshotBtnActive : ""
                  }`}
                >
                  <div className={styles.snapshotTime}>
                    {formatTimestamp(s.snapshot_at)}
                  </div>
                  <div className={styles.snapshotMeta}>
                    <span className={styles.snapshotType}>{s.snapshot_type}</span>
                    <span className={styles.snapshotPicks}>
                      {s.pick_count} picks
                    </span>
                  </div>
                  <div className={styles.snapshotModel}>{s.llm_model}</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Right: Detail */}
        <section className={styles.detailArea}>
          {detailLoading && (
            <div className={`${styles.detailLoading} glass-card`}>Loading...</div>
          )}
          {!detailLoading && detail && (
            <>
              {/* Market Context */}
              <div className={`${styles.contextCard} glass-card`}>
                <h3 className={styles.sectionTitle}>Market Context</h3>
                <div className={styles.contextGrid}>
                  <div>
                    <div className={styles.label}>Target Date</div>
                    <div className={styles.value}>
                      {detail.summary.target_date || "-"}
                    </div>
                  </div>
                  <div>
                    <div className={styles.label}>Market Regime</div>
                    <div className={styles.value}>
                      {detail.summary.market_regime || "-"}
                    </div>
                  </div>
                  <div>
                    <div className={styles.label}>Confidence</div>
                    <div className={styles.value}>
                      {detail.summary.confidence !== null
                        ? `${(detail.summary.confidence * 100).toFixed(0)}%`
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className={styles.label}>LLM Tokens</div>
                    <div className={styles.value}>
                      {detail.summary.llm_tokens_used?.toLocaleString() ?? "-"}
                    </div>
                  </div>
                </div>
                {detail.summary.macro_context && (
                  <div className={styles.macroContext}>
                    <div className={styles.label}>Macro Context</div>
                    <p className={styles.macroText}>{detail.summary.macro_context}</p>
                  </div>
                )}
                {detail.summary.data_sources.length > 0 && (
                  <div className={styles.sourcesRow}>
                    {detail.summary.data_sources.map((src) => (
                      <span key={src} className={styles.sourceTag}>
                        {src}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Hot / Weak Sectors */}
              {(detail.summary.hot_sectors.length > 0 ||
                detail.summary.weak_sectors.length > 0) && (
                <div className={styles.sectorRow}>
                  <div className={`${styles.sectorCard} glass-card`}>
                    <h3 className={styles.sectionTitleHot}>Hot Sectors</h3>
                    <ul className={styles.sectorUl}>
                      {detail.summary.hot_sectors.map((s, i) => (
                        <li key={i} className={styles.sectorItem}>
                          <span className={styles.sectorName}>{s.name}</span>
                          {s.strength_score !== undefined && (
                            <span className={styles.sectorScoreHot}>
                              {s.strength_score >= 0 ? "+" : ""}
                              {s.strength_score.toFixed(2)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={`${styles.sectorCard} glass-card`}>
                    <h3 className={styles.sectionTitleWeak}>Weak Sectors</h3>
                    <ul className={styles.sectorUl}>
                      {detail.summary.weak_sectors.map((s, i) => (
                        <li key={i} className={styles.sectorItem}>
                          <span className={styles.sectorName}>{s.name}</span>
                          {s.strength_score !== undefined && (
                            <span className={styles.sectorScoreWeak}>
                              {s.strength_score >= 0 ? "+" : ""}
                              {s.strength_score.toFixed(2)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Picks Table */}
              <div className={`${styles.picksCard} glass-card`}>
                <h3 className={styles.sectionTitle}>
                  Selected Stocks ({detail.picks.length})
                </h3>
                {detail.picks.length === 0 ? (
                  <p className={styles.emptyText}>銘柄なし</p>
                ) : (
                  <div className={styles.picksTableWrap}>
                    <table className={styles.picksTable}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Trigger</th>
                          <th>Code</th>
                          <th>Name</th>
                          <th className={styles.numRight}>Final Score</th>
                          <th className={styles.numRight}>Boost</th>
                          <th className={styles.numRight}>Conf.</th>
                          <th>Themes</th>
                          <th>Reasoning</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.picks.map((p, idx) => (
                          <tr key={p.id}>
                            <td className={styles.rank}>{idx + 1}</td>
                            <td>
                              <span
                                className={`${styles.triggerBadge} ${
                                  TRIGGER_BADGE[p.primary_trigger || ""] || ""
                                }`}
                              >
                                {p.sub_trigger}
                              </span>
                              <span className={styles.triggerLabel}>
                                {TRIGGER_LABEL[p.primary_trigger || ""] || p.primary_trigger}
                              </span>
                            </td>
                            <td className={styles.codeCell}>
                              <a
                                href={`/stocks/${encodeURIComponent(p.code)}`}
                                className={styles.codeLink}
                              >
                                {p.code}
                              </a>
                            </td>
                            <td>{p.name}</td>
                            <td className={styles.numRight}>
                              <strong>{p.final_score.toFixed(2)}</strong>
                            </td>
                            <td className={styles.numRight}>
                              ×{p.boost_factor.toFixed(2)}
                            </td>
                            <td className={styles.numRight}>
                              {(p.confidence * 100).toFixed(0)}%
                            </td>
                            <td>
                              <div className={styles.themesCell}>
                                {(p.themes || []).map((t) => (
                                  <span key={t} className={styles.themeTag}>
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className={styles.reasoningCell}>
                              {p.reasoning || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
