export const revalidate = 0
export const dynamic = 'force-dynamic'

import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import ScreenerTable, { type ScreenerRow } from "@/components/ui/ScreenerTable";
import NavHeightLogger from "@/components/ui/NavHeightLogger";
import OnboardingModal from "@/components/ui/OnboardingModal";
import TrialStarter from "@/components/TrialStarter";

const FREE_LIMIT = 5;
const TRIAL_DURATION_MS = 5 * 60 * 1000;
const EXTENSION_DURATION_MS = 15 * 60 * 1000;

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
  // getSession() reads from cookie and can return stale data; getUser() validates server-side
  const { data: { user: verifiedUser } } = await supabase.auth.getUser();
  const isGuest = !verifiedUser && !session?.user;
  console.log('[screener] verifiedUser:', verifiedUser?.id ?? null)
  console.log('[screener] session?.user:', session?.user?.id ?? null)
  console.log('[screener] isGuest:', isGuest)

  let isPro = false;
  let isTrialActive = false;
  let trialStartedAt: string | null = null;
  let trialUsed = true;
  let trialExtensionStartedAt: string | null = null;
  if (session?.user?.id) {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("subscription_status, trial_used, trial_started_at, trial_extension_started_at")
      .eq("id", session.user.id)
      .single();
    isPro =
      profile?.subscription_status === "active" ||
      profile?.subscription_status === "trialing";
    trialStartedAt = profile?.trial_started_at ?? null;
    trialUsed = profile?.trial_used ?? true;
    trialExtensionStartedAt = profile?.trial_extension_started_at ?? null;
    console.log('[screener] trial_used:', profile?.trial_used ?? null)
    console.log('[screener] trial_extension_started_at:', trialExtensionStartedAt)
    const trialElapsed = trialStartedAt ? Date.now() - new Date(trialStartedAt).getTime() : Infinity;
    const extensionElapsed = trialExtensionStartedAt ? Date.now() - new Date(trialExtensionStartedAt).getTime() : Infinity;
    isTrialActive =
      (!isPro && profile?.trial_used !== true && trialStartedAt !== null && trialElapsed < TRIAL_DURATION_MS) ||
      (!isPro && trialExtensionStartedAt !== null && extensionElapsed < EXTENSION_DURATION_MS);
  }
  const effectivelyPro = isPro || isTrialActive;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceMap = new Map((priceRows ?? []).map((p: any) => [p.ticker, p.current_price as number]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stocks: ScreenerRow[] = (rows ?? []).map((r: any) => ({
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

  // Daily random 5 for free users — seed based on UTC date so it rotates at midnight
  function getDailyFreeStocks(allStocks: ScreenerRow[], limit: number): { visible: ScreenerRow[], locked: ScreenerRow[] } {
    const today = new Date();
    const seed = today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();

    // Seeded random number generator
    let s = seed;
    function seededRandom() {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return Math.abs(s) / 0xffffffff;
    }

    function seededShuffle<T>(arr: T[]): T[] {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // Bucket by signal
    const goodStocks = allStocks.filter(s => s.signal === 'BUY+' || s.signal === 'BUY');
    const restStocks = allStocks.filter(s => s.signal !== 'BUY+' && s.signal !== 'BUY');

    // Pick 2 guaranteed from good, 3 random from rest
    const shuffledGood = seededShuffle(goodStocks);
    const shuffledRest = seededShuffle(restStocks);

    const selected = [
      ...shuffledGood.slice(0, 2),
      ...shuffledRest.slice(0, limit - 2)
    ];

    const freeSet = new Set(selected.map(s => s.ticker));
    const visible = allStocks.filter(s => freeSet.has(s.ticker));
    const locked = allStocks.filter(s => !freeSet.has(s.ticker));
    return { visible, locked };
  }

  const { visible: visibleStocks } = effectivelyPro
    ? { visible: stocks }
    : getDailyFreeStocks(stocks, FREE_LIMIT);

  const updatedAt = stocks[0]?.updated_at
    ? new Date(stocks[0].updated_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        timeZone: "UTC",
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
      <OnboardingModal />
      <NavHeightLogger />
      <TrialStarter shouldStart={!isPro && !trialUsed && trialStartedAt === null && !!session?.user?.id} />
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
          <ScreenerTable
            visibleStocks={visibleStocks}
            hasSession={!!session}
            isPro={isPro}
            trialStartedAt={isTrialActive ? trialStartedAt : null}
            trialUsed={trialUsed}
            trialExtensionStartedAt={trialExtensionStartedAt}
          />
          <p className="mt-4 text-xs text-[#00ff41]/20 text-center tracking-wide">
            DATA · FINANCIALMODELINGPREP · SCORES UPDATED WEEKLY
          </p>
        </div>
      </div>

      {/* Guest banner — fixed bottom, non-dismissible */}
      {isGuest && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[320px] z-[300]">
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
