import { PortfolioSummary, formatYen } from "./types";
import styles from "./SummaryCards.module.css";

const SUB_CARDS = [
  { key: "cash", label: "Cash Balance", valueKey: "cash_balance" as const, accentClass: styles.cardCash },
  // 投信 (Trust Funds) は 2026-06-13 廃止のため非表示 (要件 §2.2)。trust_value は常に 0。
  { key: "long", label: "Long Term", valueKey: "long_value" as const, accentClass: styles.cardLong },
];

export default function SummaryCards({ data }: { data: PortfolioSummary }) {
  return (
    <div className={styles.grid}>
      <div className={`${styles.total} glass-card`}>
        <h2 className={styles.totalLabel}>Total Asset Value</h2>
        <div className={styles.totalValue}>{formatYen(data.total_value)}</div>
      </div>

      {SUB_CARDS.map((item) => (
        <div key={item.key} className={`${styles.card} ${item.accentClass} glass-panel`}>
          <h3 className={styles.cardLabel}>{item.label}</h3>
          <div className={styles.cardValue}>{formatYen(data[item.valueKey])}</div>
        </div>
      ))}
    </div>
  );
}
