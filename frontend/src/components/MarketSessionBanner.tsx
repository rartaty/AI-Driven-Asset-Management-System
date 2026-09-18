import type { MarketSessionState } from "@/hooks/useJpxMarketSession";
import styles from "./MarketSessionBanner.module.css";

export function MarketSessionBanner({ marketSession }: { marketSession: MarketSessionState }) {
  if (marketSession.marketOpen) return null;

  return (
    <div className={styles.banner} role="status">
      <span className={styles.status}>MARKET PAUSED</span>
      <strong>{marketSession.marketLabel}</strong>
      <span className={styles.detail}>リアルタイム更新停止</span>
    </div>
  );
}
