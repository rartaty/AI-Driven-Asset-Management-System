"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getJpxMarketSession,
  parseMarketSession,
  type MarketSessionState,
} from "@/hooks/useJpxMarketSession";

export interface LiveMarketTick {
  ticker_symbol: string;
  timestamp: string | null;
  tick_timestamp: string | null;
  board_timestamp: string | null;
  last_price: number | null;
  cumulative_volume: number | null;
  delta_volume: number | null;
  bid_price: number | null;
  ask_price: number | null;
  spread: number | null;
  side_inference: string | null;
  is_synthetic: boolean;
  push_count: number | null;
  is_fresh_5m: boolean;
  source: "layer1";
}

interface LivePayload {
  server_time: string;
  updates: LiveMarketTick[];
}

interface ReadyPayload {
  market_session?: unknown;
}

export type LiveStreamStatus = "idle" | "connecting" | "open" | "reconnecting";

export function useLiveMarketStream(symbols: string[], intervalMs = 250) {
  const symbolKey = useMemo(
    () => Array.from(new Set(symbols.map((symbol) => symbol.trim()).filter(Boolean))).sort().join(","),
    [symbols],
  );
  const [ticks, setTicks] = useState<Record<string, LiveMarketTick>>({});
  const [connection, setConnection] = useState<{ key: string; status: LiveStreamStatus }>({
    key: "",
    status: "idle",
  });
  const [lastMessageAt, setLastMessageAt] = useState<Date | null>(null);
  const [marketSession, setMarketSession] = useState<MarketSessionState>(() => getJpxMarketSession());
  const activeSymbols = useMemo(() => new Set(symbolKey ? symbolKey.split(",") : []), [symbolKey]);
  const activeTicks = useMemo(
    () => Object.fromEntries(Object.entries(ticks).filter(([symbol]) => activeSymbols.has(symbol))),
    [activeSymbols, ticks],
  );
  const status: LiveStreamStatus = !symbolKey
    ? "idle"
    : connection.key === symbolKey
      ? connection.status
      : "connecting";

  useEffect(() => {
    const refreshMarketSession = () => setMarketSession(getJpxMarketSession());
    const marketClock = window.setInterval(refreshMarketSession, 30_000);
    return () => window.clearInterval(marketClock);
  }, []);

  useEffect(() => {
    if (!symbolKey) return;

    const params = new URLSearchParams({
      symbols: symbolKey,
      interval_ms: String(intervalMs),
    });
    const source = new EventSource(`/api/v1/monitoring/live?${params.toString()}`);

    const markOpen = () => setConnection({ key: symbolKey, status: "open" });
    const handleReady = (event: MessageEvent<string>) => {
      markOpen();
      try {
        const payload = JSON.parse(event.data) as ReadyPayload;
        const session = parseMarketSession(payload.market_session);
        if (session) setMarketSession(session);
      } catch {
        // The local JST clock remains the fallback market-session source.
      }
    };
    const handleMarket = (event: MessageEvent<string>) => {
      try {
        const session = parseMarketSession(JSON.parse(event.data));
        if (session) setMarketSession(session);
      } catch {
        // Preserve the previous valid market-session state.
      }
    };
    const handleTicks = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as LivePayload;
        if (!Array.isArray(payload.updates) || payload.updates.length === 0) return;
        setTicks((current) => {
          const next = { ...current };
          for (const update of payload.updates) next[update.ticker_symbol] = update;
          return next;
        });
        setLastMessageAt(new Date());
        setConnection({ key: symbolKey, status: "open" });
      } catch {
        // Keep the previous valid snapshot; EventSource will continue streaming.
      }
    };

    source.onopen = markOpen;
    source.addEventListener("ready", handleReady as EventListener);
    source.addEventListener("market", handleMarket as EventListener);
    source.addEventListener("ticks", handleTicks as EventListener);
    source.onerror = () => setConnection({ key: symbolKey, status: "reconnecting" });

    return () => {
      source.removeEventListener("ready", handleReady as EventListener);
      source.removeEventListener("market", handleMarket as EventListener);
      source.removeEventListener("ticks", handleTicks as EventListener);
      source.close();
    };
  }, [intervalMs, symbolKey]);

  return { ticks: activeTicks, status, lastMessageAt, marketSession };
}
