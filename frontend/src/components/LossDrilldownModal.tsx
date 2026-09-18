import { Activity } from "./types";
import styles from "./LossDrilldownModal.module.css";

interface LossDrilldownModalProps {
  activity: Activity | null;
  onClose: () => void;
}

export default function LossDrilldownModal({ activity, onClose }: LossDrilldownModalProps) {
  if (!activity) return null;

  return (
    <div className={styles.overlay}>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Modal */}
      <div className={`${styles.modal} glass-card`}>
        <button onClick={onClose} className={styles.closeBtn}>
          <svg className={styles.closeIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>

        <h2 className={styles.title}>
          <svg className={styles.titleIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          Trade Drilldown Analysis
        </h2>
        <p className={styles.subtitle}>{activity.title}</p>

        <div className={styles.body}>
          <div className={`${styles.section} glass-panel`}>
            <h4 className={styles.sectionLabel}>Execution Details</h4>
            <p className={styles.text}>{activity.description}</p>
            <p className={styles.timestamp}>{new Date(activity.timestamp).toLocaleString()}</p>
          </div>

          <div className={`${styles.sectionAccent} glass-panel`}>
            <h4 className={styles.sectionLabelAccent}>
              <svg className={styles.labelIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                ></path>
              </svg>
              AI Decision Reason
            </h4>
            <div className={styles.reasonText}>
              {activity.reason || "No qualitative reason recorded for this trade."}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button onClick={onClose} className={styles.actionBtn}>
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
