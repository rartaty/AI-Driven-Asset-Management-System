"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import styles from "./page.module.css";

interface FinancialSummary {
  fiscal_year: number;
  fiscal_period: string;
  report_type: string;
  fcf: number | null;
  ebitda: number | null;
  total_assets: number | null;
  shares_outstanding: number | null;
}

interface StockDetail {
  ticker_symbol: string;
  asset_name: string;
  sector: string | null;
  category: string;
  is_active: boolean;
  latest_financial: FinancialSummary | null;
}

interface PricePoint {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  adjusted_close: number | null;
}

interface PriceHistory {
  ticker_symbol: string;
  days: number;
  count: number;
  points: PricePoint[];
}

const CATEGORY_BADGE: Record<string, string> = {
  Passive: styles.badgePassive,
  Long_Solid: styles.badgeLongSolid,
  Long_Growth: styles.badgeLongGrowth,
  Short: styles.badgeShort,
};

const formatLargeYen = (amount: number | null): string => {
  if (amount === null) return "—";
  if (Math.abs(amount) >= 1_000_000_000_000) return `¥${(amount / 1_000_000_000_000).toFixed(2)}兆`;
  if (Math.abs(amount) >= 100_000_000) return `¥${(amount / 100_000_000).toFixed(2)}億`;
  if (Math.abs(amount) >= 10_000) return `¥${(amount / 10_000).toFixed(2)}万`;
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(amount);
};

export default function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [history, setHistory] = useState<PriceHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(90);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
      return Promise.all([
      fetch(`/api/v1/stocks/${ticker}`, { cache: "no-store" }).then((res) => {
        if (res.status === 404) throw new Error(`銘柄コード ${ticker} は登録されていません`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<StockDetail>;
      }),
      fetch(`/api/v1/stocks/${ticker}/price-history?days=${days}`, { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PriceHistory>;
      }),
      ]);
    })
      .then(([d, h]) => {
        if (!cancelled) {
          setDetail(d);
          setHistory(h);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, days]);

  if (loading) {
    return (
      <div className={styles.loadingWrapper}>
        <div className={styles.loadingText}>Loading {ticker}...</div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className={styles.errorWrapper}>
        <div className={styles.errorText}>{error ?? "Failed to load stock detail"}</div>
        <Link href="/" className={styles.backLink}>
          &larr; Dashboard へ戻る
        </Link>
      </div>
    );
  }

  const badgeClass = `${styles.badge} ${CATEGORY_BADGE[detail.category] ?? styles.badgePassive}`;

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <Link href="/" className={styles.backLink}>
          &larr; Dashboard
        </Link>
      </div>

      <div className={`${styles.headerCard} glass-card`}>
        <div className={styles.headerInfo}>
          <div className={styles.titleRow}>
            <span className={styles.ticker}>{detail.ticker_symbol}</span>
            <h1 className={styles.assetName}>{detail.asset_name}</h1>
            {!detail.is_active && <span className={styles.inactiveBadge}>INACTIVE</span>}
          </div>
          <div className={styles.metaRow}>
            <span className={badgeClass}>{detail.category}</span>
            {detail.sector && <span className={styles.sector}>{detail.sector}</span>}
          </div>
        </div>
      </div>

      <div className={`${styles.chartCard} glass-card`}>
        <div className={styles.chartHeader}>
          <h3 className={styles.sectionTitle}>Price History (Adjusted Close)</h3>
          <div className={styles.daysToggle}>
            {[30, 90, 365].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={days === d ? `${styles.dayBtn} ${styles.dayBtnActive}` : styles.dayBtn}
              >
                {d === 365 ? "1Y" : `${d}D`}
              </button>
            ))}
          </div>
        </div>
        {history && history.points.length > 0 ? (
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={history.points} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                <defs>
                  <linearGradient id="stockGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#B2FF05" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#B2FF05" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickMargin={10} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `¥${v.toLocaleString()}`}
                  tickMargin={10}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(20,20,20,0.8)",
                    backdropFilter: "blur(10px)",
                    borderColor: "rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                  itemStyle={{ fontSize: "14px", color: "#B2FF05", fontWeight: "bold" }}
                  formatter={(value) => [
                    `¥${(typeof value === "number" ? value : Number(value) || 0).toLocaleString()}`,
                    "Adjusted Close",
                  ]}
                  labelStyle={{ color: "#94a3b8", marginBottom: "4px" }}
                />
                <Area
                  type="monotone"
                  dataKey="adjusted_close"
                  stroke="#B2FF05"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#stockGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className={styles.empty}>No price history available in the selected window.</div>
        )}
      </div>

      <div className={`${styles.financialCard} glass-card`}>
        <h3 className={styles.sectionTitle}>Latest Financial Summary</h3>
        {detail.latest_financial ? (
          <div className={styles.financialGrid}>
            <div className={styles.financialItem}>
              <span className={styles.financialLabel}>Fiscal Period</span>
              <span className={styles.financialValue}>
                FY{detail.latest_financial.fiscal_year} {detail.latest_financial.fiscal_period}
              </span>
            </div>
            <div className={styles.financialItem}>
              <span className={styles.financialLabel}>FCF</span>
              <span className={styles.financialValue}>{formatLargeYen(detail.latest_financial.fcf)}</span>
            </div>
            <div className={styles.financialItem}>
              <span className={styles.financialLabel}>EBITDA</span>
              <span className={styles.financialValue}>{formatLargeYen(detail.latest_financial.ebitda)}</span>
            </div>
            <div className={styles.financialItem}>
              <span className={styles.financialLabel}>Total Assets</span>
              <span className={styles.financialValue}>{formatLargeYen(detail.latest_financial.total_assets)}</span>
            </div>
            <div className={styles.financialItem}>
              <span className={styles.financialLabel}>Shares Outstanding</span>
              <span className={styles.financialValue}>
                {detail.latest_financial.shares_outstanding !== null
                  ? detail.latest_financial.shares_outstanding.toLocaleString()
                  : "—"}
              </span>
            </div>
          </div>
        ) : (
          <div className={styles.empty}>No financial reports filed for this ticker yet.</div>
        )}
      </div>
    </div>
  );
}
