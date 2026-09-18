"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./StockSearch.module.css";

export default function StockSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/stocks/${encodeURIComponent(trimmed)}`);
    setQuery("");
  };

  return (
    <form onSubmit={handleSearch} className={styles.form}>
      <div className={`${styles.inputWrapper} ${isFocused ? styles.focused : ""}`}>
        <div className={styles.iconWrapper}>
          <svg
            className={`${styles.icon} ${isFocused ? styles.focused : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          className={styles.input}
          placeholder="Search Ticker (e.g. 7203)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      </div>
    </form>
  );
}
