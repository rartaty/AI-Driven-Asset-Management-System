import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import StockSearch from "@/components/StockSearch";
import styles from "./layout.module.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Project Big Tester - AI Asset Management",
  description: "AI-driven wealth management platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="dark">
      <body className={`${inter.className} ${styles.body}`}>
        {/* Navigation Bar (Glassmorphism) */}
        <nav className={`${styles.nav} glass-panel`}>
          <div className={styles.navInner}>
            <div className={styles.navRow}>
              <div className={styles.navLeft}>
                <span className={styles.brand}>Project Big Tester</span>
                <div className={styles.links}>
                  <Link href="/" className={styles.link}>
                    Cockpit
                  </Link>
                  <Link href="/analytics" className={styles.link}>
                    Analytics
                  </Link>
                  <Link href="/timeline" className={styles.link}>
                    Timeline
                  </Link>
                  <Link href="/reports" className={styles.link}>
                    AI Reports
                  </Link>
                </div>
              </div>
              <div className={styles.navRight}>
                <StockSearch />
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className={styles.main}>{children}</main>
      </body>
    </html>
  );
}
