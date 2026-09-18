"use client";

import { useEffect, useState } from "react";

export type MarketPhase = "morning" | "lunch_break" | "afternoon" | "closed";

export interface MarketSessionState {
  marketOpen: boolean;
  marketPhase: MarketPhase;
  marketLabel: string;
  checkedAt: string;
  timezone: "Asia/Tokyo";
}

interface MarketSessionWire {
  market_open: boolean;
  market_phase: MarketPhase;
  market_label: string;
  checked_at: string;
  timezone: "Asia/Tokyo";
}

const JST_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function getJpxMarketSession(now = new Date()): MarketSessionState {
  const parts = Object.fromEntries(
    JST_PARTS.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const weekday = parts.weekday;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const isWeekday = weekday !== "Sat" && weekday !== "Sun";

  let marketPhase: MarketPhase = "closed";
  let marketOpen = false;
  if (isWeekday && minutes >= 9 * 60 && minutes < 11 * 60 + 30) {
    marketPhase = "morning";
    marketOpen = true;
  } else if (isWeekday && minutes >= 12 * 60 + 30 && minutes < 15 * 60 + 15) {
    marketPhase = "afternoon";
    marketOpen = true;
  } else if (isWeekday && minutes >= 11 * 60 + 30 && minutes < 12 * 60 + 30) {
    marketPhase = "lunch_break";
  }

  return {
    marketOpen,
    marketPhase,
    marketLabel: marketOpen ? "市場稼働中" : "市場休止中 — 引け値表示",
    checkedAt: now.toISOString(),
    timezone: "Asia/Tokyo",
  };
}

export function parseMarketSession(value: unknown): MarketSessionState | null {
  if (!value || typeof value !== "object") return null;
  const wire = value as Partial<MarketSessionWire>;
  if (
    typeof wire.market_open !== "boolean"
    || !["morning", "lunch_break", "afternoon", "closed"].includes(wire.market_phase ?? "")
    || typeof wire.market_label !== "string"
  ) {
    return null;
  }
  return {
    marketOpen: wire.market_open,
    marketPhase: wire.market_phase as MarketPhase,
    marketLabel: wire.market_label,
    checkedAt: typeof wire.checked_at === "string" ? wire.checked_at : new Date().toISOString(),
    timezone: "Asia/Tokyo",
  };
}

export function useJpxMarketSession() {
  const [marketSession, setMarketSession] = useState<MarketSessionState>(() => getJpxMarketSession());

  useEffect(() => {
    const refresh = () => setMarketSession(getJpxMarketSession());
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return marketSession;
}
