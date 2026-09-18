export interface Position {
  symbol: string;
  name: string;
  category: string;
  shares: number;
  avg_price: number;
  current_price: number;
  unrealized_pnl: number;
}

export interface Activity {
  id?: string;
  timestamp: string;
  type: string;
  message?: string;
  title?: string;
  description?: string;
  reason?: string;
  is_loss?: boolean;
}

export interface ChartData {
  date: string;
  Trust: number;
  Long: number;
  Cash: number;
}

export interface BucketCashBalances {
  Short: number;
  Long_Solid: number;
  Long_Growth: number;
  Passive: number;
  Unallocated: number;
}

export interface PortfolioSummary {
  target_date: string;
  bank_balance?: number;
  buying_power?: number;
  trust_value: number;
  long_solid_value?: number;
  long_growth_value?: number;
  short_term_market_value?: number;
  long_value: number;
  short_value: number;
  cash_balance: number;
  total_value: number;
  managed_asset_value?: number;
  total_asset_value?: number;
  accumulated_sweep: number;
  positions: Position[];
  recent_activity: Activity[];
  chart_data: ChartData[];
  is_mock: boolean;
  trade_mode?: "PAPER" | "PAPER_LIVE" | "REAL";
  // ADR-0028 Phase 2/3: bucket 別 cash 残高
  cash_balances?: BucketCashBalances;
  bucket_strict_mode?: boolean;
}

export const formatYen = (amount: number) => {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(amount);
};
