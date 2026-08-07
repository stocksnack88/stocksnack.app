import { unstable_cache } from 'next/cache'
import { supabaseAdmin, fetchAllRows } from "@/lib/supabase";
import { isLaunchedStock } from "@/lib/constants";
import type { ScreenerRow } from "@/components/ui/ScreenerTable";

// Stock data is updated weekly — cache for 60 s to avoid hitting DB on every request.
// Shared by /screener (full universe) and /watchlist (filtered to saved tickers) so
// both pages agree on the same universe rank (# out of COVERED_STOCK_COUNT).
export const getAllScreenerRows = unstable_cache(
  async (): Promise<{ stocks: ScreenerRow[]; error: unknown }> => {
    const [{ data: rawRows, error }, { data: priceRows }] = await Promise.all([
      fetchAllRows((start, end) =>
        supabaseAdmin
          .from("stock_scores")
          .select(`
            ticker,
            ppm_cagr,
            ppm_blended_price,
            growth_score,
            health_passes,
            final_score,
            signal,
            updated_at,
            has_anomaly,
            anomaly_reasons,
            m_cumulative_div_ps,
            div_yield_5y_avg,
            div_yield,
            stocks ( name, index_tags )
          `)
          .order("final_score", { ascending: false })
          .range(start, end)
      ),
      fetchAllRows((start, end) =>
        supabaseAdmin.from("stock_prices").select("ticker, current_price").range(start, end)
      ),
    ]);

    // Backend can freely ingest S&P 400/600 ahead of launch — this keeps them
    // out of the live screener until index_tags says otherwise. See lib/constants.ts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (rawRows ?? []).filter((r: any) => isLaunchedStock(r.stocks?.index_tags));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priceMap = new Map((priceRows ?? []).map((p: any) => [p.ticker, p.current_price as number]));

    // rows is already ordered final_score DESC from Supabase — index+1 is the true universe rank.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stocks: ScreenerRow[] = rows.map((r: any, i: number) => ({
      ticker: r.ticker,
      name: r.stocks?.name ?? null,
      ppm_cagr: r.ppm_cagr,
      ppm_blended_price: r.ppm_blended_price,
      current_price: priceMap.get(r.ticker) ?? null,
      growth_score: r.growth_score,
      health_passes: r.health_passes,
      signal: r.signal,
      updated_at: r.updated_at,
      has_anomaly: r.has_anomaly ?? null,
      anomaly_reasons: r.anomaly_reasons ?? null,
      m_cumulative_div_ps: r.m_cumulative_div_ps ?? null,
      div_yield_5y_avg: r.div_yield_5y_avg ?? null,
      div_yield: r.div_yield ?? null,
      rank: i + 1,
    }));

    return { stocks, error: error ?? null };
  },
  ['screener-stock-data'],
  { revalidate: 60 }
);
