import { Position, formatYen } from "./types";
import styles from "./PositionsTable.module.css";

const BADGE_CLASS: Record<string, string> = {
  Passive: styles.badgePassive,
  Long_Solid: styles.badgeLongSolid,
  Long_Growth: styles.badgeLongGrowth,
  Short: styles.badgeShort,
};

export default function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <div className={`${styles.container} glass-card`}>
      <h3 className={styles.title}>Active Positions</h3>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr>
              <th className={styles.th}>Symbol</th>
              <th className={styles.th}>Category</th>
              <th className={styles.thRight}>Shares</th>
              <th className={styles.thRight}>Avg Price</th>
              <th className={styles.thRight}>Current</th>
              <th className={styles.thRight}>Unrealized PNL</th>
            </tr>
          </thead>
          <tbody>
            {(positions || []).map((pos, idx) => {
              const badge = `${styles.badge} ${BADGE_CLASS[pos.category] ?? styles.badgeDefault}`;
              const pnlClass = `${styles.tdPnl} ${pos.unrealized_pnl >= 0 ? styles.tdPnlPositive : styles.tdPnlNegative}`;
              return (
                <tr key={idx} className={styles.row}>
                  <td className={styles.tdSymbol}>
                    {pos.symbol} <span className={styles.subSymbol}>{pos.name}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={badge}>{pos.category}</span>
                  </td>
                  <td className={styles.tdRight}>{pos.shares.toLocaleString()}</td>
                  <td className={styles.tdMuted}>¥{pos.avg_price.toLocaleString()}</td>
                  <td className={styles.tdRight}>¥{pos.current_price.toLocaleString()}</td>
                  <td className={pnlClass}>
                    {pos.unrealized_pnl >= 0 ? "+" : ""}
                    {formatYen(pos.unrealized_pnl)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
