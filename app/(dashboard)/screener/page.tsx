import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import InfoTooltip from "@/components/ui/InfoTooltip";
import ScreenerTable, { type ScreenerRow } from "@/components/ui/ScreenerTable";

const FREE_LIMIT = 5;

export default async function ScreenerPage({
  searchParams,
}: {
  searchParams: { upgraded?: string };
}) {
  const justUpgraded = searchParams.upgraded === "1";
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  let isPro = false;
  if (session?.user?.id) {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("subscription_status")
      .eq("id", session.user.id)
      .single();
    isPro =
      profile?.subscription_status === "active" ||
      profile?.subscription_status === "trialing";
  }

  const [{ data: rows, error }, { data: priceRows }] = await Promise.all([
    supabaseAdmin
      .from("stock_scores")
      .select(`
        ticker,
        ppm_score,
        ppm_cagr,
        ppm_blended_price,
        growth_score,
        health_score,
        final_score,
        signal,
        updated_at,
        stocks ( name )
      `)
      .order("final_score", { ascending: false }),
    supabaseAdmin.from("stock_prices").select("ticker, current_price"),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceMap = new Map((priceRows ?? []).map((p: any) => [p.ticker, p.current_price as number]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stocks: ScreenerRow[] = (rows ?? []).map((r: any) => ({
    ticker: r.ticker,
    name: r.stocks?.name ?? null,
    ppm_cagr: r.ppm_cagr,
    ppm_blended_price: r.ppm_blended_price,
    current_price: priceMap.get(r.ticker) ?? null,
    ppm_score: r.ppm_score,
    growth_score: r.growth_score,
    health_score: r.health_score,
    final_score: r.final_score,
    signal: r.signal,
    updated_at: r.updated_at,
  }));

  const visibleStocks = isPro ? stocks : stocks.slice(0, FREE_LIMIT);
  const lockedStocks  = isPro ? [] : stocks.slice(FREE_LIMIT);

  const updatedAt = stocks[0]?.updated_at
    ? new Date(stocks[0].updated_at).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit",
        timeZone: "UTC", timeZoneName: "short",
      })
    : null;

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-red-400 font-mono">Error loading screener data.</p>
      </div>
    );
  }

  return (
    <div className="bg-black text-[#00ff41]" style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}>
      {justUpgraded && (
        <div className="bg-[#00ff41]/10 border-b border-[#00ff41]/30 px-6 py-3 text-center">
          <p className="text-xs text-[#00ff41] font-bold tracking-widest">
            ✓ WELCOME TO PRO — ALL STOCKS ARE NOW UNLOCKED
          </p>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-[#00ff41]/20 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1 md:gap-4">
            <div className="flex flex-col">
              <h1 className="text-xl sm:text-2xl font-bold tracking-[0.15em] sm:tracking-[0.3em] text-[#00ff41]">
                STOCK SCREENER
              </h1>
              <div className="flex items-center mt-1">
                <span className="text-[10px] text-[#00ff41]/40 tracking-widest font-bold">SCORES (0–100)</span>
                <InfoTooltip>
                  <div className="flex flex-col gap-2 text-[11px] tracking-widest">
                    <div className="flex items-center gap-2">
                      <span className="text-[#00ff41]">■</span>
                      <span className="text-[#00ff41]">≥70 STRONG</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-300">■</span>
                      <span className="text-yellow-300">45–69 MODERATE</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-red-400">■</span>
                      <span className="text-red-400">&lt;45 WEAK</span>
                    </div>
                  </div>
                </InfoTooltip>
              </div>
            </div>
            <div className="text-left md:text-right">
              {updatedAt && (
                <p className="text-[10px] md:text-xs text-[#00ff41]/40">UPDATED {updatedAt.toUpperCase()}</p>
              )}
              {isPro && (
                <p className="text-[10px] md:text-xs md:mt-0.5">
                  <span className="text-[#00ff41]">● PRO · ALL {stocks.length} STOCKS</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <ScreenerTable
            visibleStocks={visibleStocks}
            lockedStocks={lockedStocks}
            hasSession={!!session}
          />
          <p className="mt-4 text-xs text-[#00ff41]/20 text-center tracking-wide">
            DATA · FINANCIALMODELINGPREP · SCORES UPDATED WEEKLY
          </p>
        </div>
      </div>
    </div>
  );
}
