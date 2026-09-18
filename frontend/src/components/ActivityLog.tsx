"use client";
import { useState } from "react";
import { Activity } from "./types";
import LossDrilldownModal from "./LossDrilldownModal";
import styles from "./ActivityLog.module.css";

export default function ActivityLog({ activities }: { activities: Activity[] }) {
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);

  const getDotClass = (act: Activity): string => {
    if (act.type === "Trade" && act.is_loss) return styles.dotLoss;
    if (act.type === "Trade") return styles.dotProfit;
    return styles.dotEvent;
  };

  return (
    <div className={styles.container}>
      {/* タイムライン */}
      <div className={`${styles.timelineCard} glass-card`}>
        <h3 className={styles.title}>AI Timeline & Events</h3>
        <div className={styles.timeline}>
          {(activities || []).map((act, idx) => {
            const isTrade = act.type === "Trade";
            const itemClass = `${styles.item} ${isTrade ? styles.itemTrade : ""}`;
            return (
              <div
                key={idx}
                className={itemClass}
                onClick={() => isTrade && setSelectedActivity(act)}
              >
                <div className={styles.markerCol}>
                  <div className={`${styles.dot} ${getDotClass(act)}`} />
                  {idx !== (activities || []).length - 1 && <div className={styles.connector} />}
                </div>
                <div className={styles.body}>
                  <div className={styles.timestamp}>{new Date(act.timestamp).toLocaleString()}</div>
                  <div className={isTrade ? styles.itemTitleTrade : styles.itemTitle}>
                    {act.title || act.type}
                  </div>
                  <div className={styles.description}>{act.description || act.message}</div>
                  {isTrade && <div className={styles.cta}>Click to view AI reasoning →</div>}
                </div>
              </div>
            );
          })}
          {activities.length === 0 && <div className={styles.empty}>No recent activity</div>}
        </div>
      </div>

      {/* ルールステータス */}
      <div className={`${styles.statusPanel} glass-panel`}>
        <h3 className={styles.statusTitle}>
          <svg className={styles.statusIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          System Core Status
        </h3>
        <ul className={styles.statusList}>
          <li className={styles.statusItemBordered}>
            <span>Drawdown Lock</span>
            <span className={styles.statusValue}>Active</span>
          </li>
          <li className={styles.statusItemBordered}>
            <span>Overnight Risk</span>
            <span className={styles.statusValue}>Cleared</span>
          </li>
          <li className={styles.statusItem}>
            <span>Bank Reserve</span>
            <span className={styles.statusValue}>Secure</span>
          </li>
        </ul>
      </div>

      <LossDrilldownModal
        activity={selectedActivity}
        onClose={() => setSelectedActivity(null)}
      />
    </div>
  );
}
