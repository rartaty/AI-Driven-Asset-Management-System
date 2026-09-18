"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

// M11-3: AI タイムライン (要件 §2.4 #5)
// AI がどの銘柄を分析し、マクロ環境・ファンダメンタルズ等をどう評価し、
// どのような結果に至ったかを時系列で確認可能にする.

type EventType = "Trade" | "SystemEvent" | "AIScreening" | "AIReport";

interface TimelineEvent {
  id: string;
  type: EventType;
  timestamp: string | null;

  // Trade
  symbol?: string;
  action?: string;
  quantity?: number;
  price?: number;
  pnl?: number | null;
  is_loss?: boolean;
  decision_reason?: string | null;

  // SystemEvent
  level?: string;
  component?: string;
  event?: string;
  payload?: Record<string, unknown> | null;

  // AIScreening
  snapshot_type?: string;
  market_regime?: string | null;
  confidence?: number | null;
  hot_sectors?: Array<{ name?: string } | string> | null;
  weak_sectors?: Array<{ name?: string } | string> | null;
  pick_count?: number;
  llm_model?: string | null;
  summary_id?: number;

  // AIReport
  report_type?: string | null;
  target_date?: string | null;
  summary_preview?: string;
  has_loss_classifications?: boolean;
}

interface TimelineResponse {
  timeline: TimelineEvent[];
}

const TYPE_COLOR: Record<EventType, string> = {
  Trade: "#f59e0b",        // amber
  SystemEvent: "#94a3b8",  // slate
  AIScreening: "#3b82f6",  // blue
  AIReport: "#a855f7",     // purple
};

const TYPE_LABEL: Record<EventType, string> = {
  Trade: "売買",
  SystemEvent: "システム",
  AIScreening: "AI スクリーニング",
  AIReport: "AI レポート",
};

const HOURS_OPTIONS = [1, 6, 24, 72, 168, 720];

function formatTimestamp(ts: string | null): string {
  if (!ts) return "-";
  try {
    const d = new Date(ts);
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function sectorName(s: { name?: string } | string): string {
  if (typeof s === "string") return s;
  return s?.name || "?";
}

function renderEvent(ev: TimelineEvent): { title: string; body: string; meta: string[] } {
  switch (ev.type) {
    case "Trade": {
      const pnlStr = ev.pnl != null
        ? ` pnl=¥${Number(ev.pnl).toLocaleString("ja-JP")}`
        : "";
      const title = `${ev.action || ""} ${ev.symbol || ""} qty=${ev.quantity || 0} ¥${ev.price ?? 0}${pnlStr}`;
      const body = ev.decision_reason || "(理由未記録)";
      const meta: string[] = [];
      if (ev.is_loss) meta.push("損失");
      return { title, body, meta };
    }
    case "SystemEvent": {
      const title = `${ev.component || ""} ${ev.event || ""}`;
      const body = ev.payload
        ? JSON.stringify(ev.payload, null, 2).slice(0, 400)
        : "";
      const meta: string[] = [];
      if (ev.level) meta.push(ev.level);
      return { title, body, meta };
    }
    case "AIScreening": {
      const title = `Tier 1 朝バッチ — ${ev.snapshot_type || ""} (picks ${ev.pick_count ?? 0})`;
      const hot = (ev.hot_sectors || []).slice(0, 3).map(sectorName).join(", ");
      const weak = (ev.weak_sectors || []).slice(0, 3).map(sectorName).join(", ");
      const body = [
        ev.market_regime ? `Regime: ${ev.market_regime}` : "",
        hot ? `Hot: ${hot}` : "",
        weak ? `Weak: ${weak}` : "",
      ].filter(Boolean).join(" / ");
      const meta: string[] = [];
      if (ev.confidence != null) meta.push(`confidence ${(ev.confidence * 100).toFixed(0)}%`);
      if (ev.llm_model) meta.push(ev.llm_model);
      return { title, body, meta };
    }
    case "AIReport": {
      const title = `${ev.report_type || ""} レポート — ${ev.target_date || ""}`;
      const body = ev.summary_preview || "(空)";
      const meta: string[] = [];
      if (ev.has_loss_classifications) meta.push("損失分類あり");
      return { title, body, meta };
    }
    default:
      return { title: "(unknown)", body: "", meta: [] };
  }
}

export default function AITimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(24);
  const [selectedTypes, setSelectedTypes] = useState<Set<EventType>>(
    new Set(["Trade", "AIScreening", "AIReport"]),
  );

  useEffect(() => {
    let cancelled = false;
    const typeParam = Array.from(selectedTypes).join(",");
    const url = `/api/v1/analytics/timeline?hours=${hours}&limit=100&types=${encodeURIComponent(typeParam)}`;
    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setLoading(true);
        setError(null);
        return fetch(url);
      })
      .then((res) => {
        if (!res) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: TimelineResponse) => {
        if (!cancelled && json) {
          setEvents(json.timeline || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to fetch timeline:", err);
          setError(err instanceof Error ? err.message : "fetch failed");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hours, selectedTypes]);

  const toggleType = (t: EventType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        next.delete(t);
      } else {
        next.add(t);
      }
      // 空集合は不可 (= 全 type 解除すると view が無意味)
      if (next.size === 0) {
        return prev;
      }
      return next;
    });
  };

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.type] = (counts[e.type] || 0) + 1;
    }
    return counts;
  }, [events]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.heading}>AI Timeline</h1>
        <p className={styles.subheading}>
          AI の意思決定 (Tier 1 朝バッチ / 売買 / Tier 3 レポート) + システムイベントを時系列で確認
        </p>

        <div className={styles.toolbar}>
          {/* Type フィルタ */}
          {(Object.keys(TYPE_LABEL) as EventType[]).map((t) => (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className={selectedTypes.has(t) ? styles.toggleBtnActive : styles.toggleBtn}
              style={{
                borderColor: selectedTypes.has(t) ? TYPE_COLOR[t] : undefined,
                background: selectedTypes.has(t) ? `${TYPE_COLOR[t]}25` : undefined,
              }}
            >
              {TYPE_LABEL[t]} {stats[t] ? `(${stats[t]})` : ""}
            </button>
          ))}

          {/* hours セレクタ */}
          <span style={{ color: "#94a3b8", fontSize: "0.85rem", marginLeft: "0.5rem" }}>
            期間
          </span>
          <select
            className={styles.hoursSelect}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            {HOURS_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h < 24 ? `${h}h` : h <= 168 ? `${h / 24}日` : `${(h / 24 / 7).toFixed(0)}週`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading timeline...</div>
      ) : error ? (
        <div className={styles.error}>取得失敗: {error}</div>
      ) : events.length === 0 ? (
        <div className={styles.empty}>
          イベントなし — 指定期間 ({hours}h) / 選択 type に該当する記録がありません
        </div>
      ) : (
        <div className={styles.timeline}>
          {events.map((ev) => {
            const { title, body, meta } = renderEvent(ev);
            return (
              <div
                key={ev.id}
                className={styles.eventCard}
                style={{ "--type-color": TYPE_COLOR[ev.type] } as React.CSSProperties}
              >
                <div className={styles.eventHeader}>
                  <span
                    className={styles.typeBadge}
                    style={{ background: TYPE_COLOR[ev.type] }}
                  >
                    {TYPE_LABEL[ev.type]}
                  </span>
                  <span className={styles.timestamp}>{formatTimestamp(ev.timestamp)}</span>
                </div>
                <div className={styles.eventTitle}>{title}</div>
                {body && <div className={styles.eventBody}>{body}</div>}
                {meta.length > 0 && (
                  <div className={styles.metaRow}>
                    {meta.map((m, i) => <span key={i}>{m}</span>)}
                  </div>
                )}
                {ev.type === "AIScreening" && ev.summary_id && (
                  <Link
                    href={`/analytics`}
                    style={{
                      color: TYPE_COLOR.AIScreening,
                      fontSize: "0.8rem",
                      textDecoration: "none",
                    }}
                  >
                    → Analytics で詳細を見る
                  </Link>
                )}
                {ev.type === "AIReport" && (
                  <Link
                    href="/reports"
                    style={{
                      color: TYPE_COLOR.AIReport,
                      fontSize: "0.8rem",
                      textDecoration: "none",
                    }}
                  >
                    → Reports で詳細を見る
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
