export const dynamic = 'force-dynamic'

import { unstable_cache } from 'next/cache'
import { supabaseAdmin } from "@/lib/supabase";
import { getCachedUser, getCachedUserProfile } from "@/lib/server-auth";
import ScreenerTable, { type ScreenerRow } from "@/components/ui/ScreenerTable";
import ScreenerTableErrorBoundary from "@/components/ui/ScreenerTableErrorBoundary";
import NavHeightLogger from "@/components/ui/NavHeightLogger";
import OnboardingModal from "@/components/ui/OnboardingModal";
import { getDailyFreeStocks } from "@/lib/free-stocks";

const FREE_LIMIT = 5;
const TRIAL_DURATION_MS = 5 * 60 * 1000;
const EXTENSION_DURATION_MS = 15 * 60 * 1000;

// Stock data is updated weekly — cache for 60 s to avoid hitting DB on every request
const getStockData = unstable_cache(
  async () => {
    const [{ data: rows, error }, { data: priceRows }] = await Promise.all([
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
          stocks ( name )
        `)
        .order("final_score", { ascending: false }),
      supabaseAdmin.from("stock_prices").select("ticker, current_price"),
    ]);
    return { rows: rows ?? [], error: error ?? null, priceRows: priceRows ?? [] };
  },
  ['screener-stock-data'],
  { revalidate: 60 }
);

export default async function ScreenerPage({
  searchParams,
}: {
  searchParams: { upgraded?: string };
}) {
  const justUpgraded = searchParams.upgraded === "1";

  // Auth and stock data run concurrently — stock data doesn't depend on who the user is
  const [user, { rows, error, priceRows }] = await Promise.all([
    getCachedUser(),
    getStockData(),
  ]);

  const isGuest = !user;
  console.log('[screener] user:', user?.id ?? null, 'isGuest:', isGuest);

  let isPro = false;
  let isTrialActive = false;
  let trialStartedAt: string | null = null;
  let trialUsed = false;
  let trialExtensionStartedAt: string | null = null;

  if (user) {
    // Profile is already cached from layout — no extra DB hit
    const profile = await getCachedUserProfile(user.id);
    isPro =
      profile?.subscription_status === "active" ||
      profile?.subscription_status === "trialing";
    trialStartedAt = profile?.trial_started_at ?? null;
    trialUsed = profile?.trial_used ?? true;
    trialExtensionStartedAt = profile?.trial_extension_started_at ?? null;
    console.log('[screener] trial_used:', profile?.trial_used ?? null);
    console.log('[screener] trial_extension_started_at:', trialExtensionStartedAt);
    const trialElapsed = trialStartedAt ? Date.now() - new Date(trialStartedAt).getTime() : Infinity;
    const extensionElapsed = trialExtensionStartedAt ? Date.now() - new Date(trialExtensionStartedAt).getTime() : Infinity;
    isTrialActive =
      (!isPro && profile?.trial_used !== true && trialStartedAt !== null && trialElapsed < TRIAL_DURATION_MS) ||
      (!isPro && trialExtensionStartedAt !== null && extensionElapsed < EXTENSION_DURATION_MS);
  }
  const effectivelyPro = isPro || isTrialActive;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceMap = new Map((priceRows).map((p: any) => [p.ticker, p.current_price as number]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stocks: ScreenerRow[] = (rows).map((r: any) => ({
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
  }));

  const { visible: rawVisible } = effectivelyPro
    ? { visible: stocks }
    : getDailyFreeStocks(stocks, FREE_LIMIT);

  // Randomize order on every page load (force-dynamic ensures a new shuffle per request)
  const visibleStocks = [...rawVisible].sort(() => Math.random() - 0.5);

  const updatedAt = stocks[0]?.updated_at
    ? new Date(stocks[0].updated_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        timeZone: "UTC",
      })
    : null;

  console.log('[screener] stocks.length:', stocks.length, 'visibleStocks.length:', visibleStocks.length, 'effectivelyPro:', effectivelyPro)

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-red-400 font-mono">Error loading screener data.</p>
      </div>
    );
  }

  return (
    <div className="bg-black text-[#00ff41]" style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}>
      <OnboardingModal />
      <NavHeightLogger />
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
            </div>
            <div className="text-left md:text-right">
              {updatedAt && (
                <p className="text-[10px] md:text-xs text-[#00ff41]/40">UPDATED {updatedAt.toUpperCase()}</p>
              )}
              {(isPro || isTrialActive) && (
                <p className="text-[10px] md:text-xs md:mt-0.5">
                  <span className="text-[#00ff41]">● {isTrialActive ? "PRO PREVIEW" : "PRO"} · ALL {stocks.length} STOCKS</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <ScreenerTableErrorBoundary>
            <ScreenerTable
              visibleStocks={visibleStocks}
              hasSession={!!user}
              isPro={isPro}
              trialStartedAt={isTrialActive ? trialStartedAt : null}
              trialUsed={trialUsed}
              trialExtensionStartedAt={trialExtensionStartedAt}
            />
          </ScreenerTableErrorBoundary>
          <p className="mt-4 text-xs text-[#00ff41]/20 text-center tracking-wide">
            DATA · FINANCIALMODELINGPREP · SCORES UPDATED WEEKLY
          </p>
        </div>
      </div>

      {isGuest && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[320px] z-[50]">
          <div className="bg-[#050505] border border-[#00ff41]/20 rounded-xl px-5 py-4 flex flex-col gap-3 shadow-lg shadow-black/60">
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-mono font-bold text-[#00ff41] tracking-[0.2em]">
                YOUR 5-MINUTE FREE TRIAL IS WAITING
              </p>
              <p className="text-xs font-mono text-[#00ff41]/50 leading-relaxed">
                See all 500 stocks free. No credit card needed.
              </p>
            </div>
            <a
              href="/signup"
              className="bg-[#00ff41] text-black font-bold font-mono text-xs tracking-widest px-4 py-2 rounded hover:bg-[#00dd38] transition-colors text-center"
            >
              SIGN UP FREE →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
