export const dynamic = 'force-dynamic'

import { COVERED_STOCK_COUNT, isFreeTierStock } from "@/lib/constants";
import { getCachedUser, getCachedUserProfile } from "@/lib/server-auth";
import { getAllScreenerRows } from "@/lib/screener-data";
import ScreenerTable from "@/components/ui/ScreenerTable";
import ScreenerTableErrorBoundary from "@/components/ui/ScreenerTableErrorBoundary";
import NavHeightLogger from "@/components/ui/NavHeightLogger";
import OnboardingModal from "@/components/ui/OnboardingModal";
import { TourConversionGate } from "@/components/ui/GuidedTour";
import { getDailyFreeStocks } from "@/lib/free-stocks";

const FREE_LIMIT = 5;
const TRIAL_DURATION_MS = 5 * 60 * 1000;
const EXTENSION_DURATION_MS = 15 * 60 * 1000;

export default async function ScreenerPage({
  searchParams,
}: {
  searchParams: { upgraded?: string };
}) {
  const justUpgraded = searchParams.upgraded === "1";

  // Auth and stock data run concurrently — stock data doesn't depend on who the user is
  const [user, { stocks, error }] = await Promise.all([
    getCachedUser(),
    getAllScreenerRows(),
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

  // S&P 400/600 are Pro-only (launched 2026-08-07) — free-tier users still only
  // pick from the S&P 500 base universe.
  const tierStocks = effectivelyPro ? stocks : stocks.filter(s => isFreeTierStock(s.index_tags));

  const { visible: rawVisible } = effectivelyPro
    ? { visible: tierStocks }
    : getDailyFreeStocks(tierStocks, FREE_LIMIT);

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
          <div className="flex flex-row items-start justify-between gap-2 md:items-baseline md:gap-4">
            <div className="flex flex-col min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold tracking-[0.1em] sm:tracking-[0.3em] text-[#00ff41] truncate">
                STOCK SCREENER
              </h1>
            </div>
            {updatedAt && (
              <p className="text-[9px] sm:text-xs text-[#00ff41]/40 whitespace-nowrap shrink-0">UPDATED {updatedAt.toUpperCase()}</p>
            )}
          </div>
          {(isPro || isTrialActive) && (
            <p className="text-[9px] sm:text-xs mt-1">
              <span className="text-[#00ff41]">● {isTrialActive ? "PRO PREVIEW" : "PRO"} · S&amp;P 500 + {tierStocks.length} STOCKS</span>
            </p>
          )}
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
            DATA · PUBLIC FILINGS + MARKET DATA · SCORES UPDATED WEEKLY
          </p>
        </div>
      </div>

      {isGuest && (
        <TourConversionGate>
          <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[320px] z-[50]">
            <div className="bg-[#050505] border border-[#00ff41]/20 rounded-xl px-5 py-4 flex flex-col gap-3 shadow-lg shadow-black/60">
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-mono font-bold text-[#00ff41] tracking-[0.2em]">
                YOUR 5-MINUTE FREE TRIAL IS WAITING
              </p>
              <p className="text-xs font-mono text-[#00ff41]/50 leading-relaxed">
                See all {COVERED_STOCK_COUNT} stocks free. No credit card needed.
              </p>
            </div>
            <a
              href="/signup"
              className="bg-[#00ff41] text-black font-bold font-mono text-xs tracking-widest px-4 py-2 rounded hover:bg-[#00dd38] transition-colors text-center"
            >
              START 5 MIN PRO TRIAL →
            </a>
            </div>
          </div>
        </TourConversionGate>
      )}
    </div>
  );
}
