export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { getCachedUser, getCachedUserProfile } from '@/lib/server-auth'
import { getAllScreenerRows } from '@/lib/screener-data'
import ScreenerTable, { type ScreenerRow } from '@/components/ui/ScreenerTable'
import ScreenerTableErrorBoundary from '@/components/ui/ScreenerTableErrorBoundary'
import NavHeightLogger from '@/components/ui/NavHeightLogger'

const TRIAL_DURATION_MS = 5 * 60 * 1000
const EXTENSION_DURATION_MS = 15 * 60 * 1000

export default async function WatchlistPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const [profile, { data: watchlistRows }, { stocks: allStocks, error }] = await Promise.all([
    getCachedUserProfile(user.id),
    supabaseAdmin
      .from('watchlist')
      .select('ticker')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    getAllScreenerRows(),
  ])

  const isPro = profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing'
  const trialStartedAt = profile?.trial_started_at ?? null
  const trialExtensionStartedAt = profile?.trial_extension_started_at ?? null
  const trialElapsed = trialStartedAt ? Date.now() - new Date(trialStartedAt).getTime() : Infinity
  const extensionElapsed = trialExtensionStartedAt ? Date.now() - new Date(trialExtensionStartedAt).getTime() : Infinity
  const isTrialActive =
    (!isPro && profile?.trial_used !== true && trialStartedAt !== null && trialElapsed < TRIAL_DURATION_MS) ||
    (!isPro && trialExtensionStartedAt !== null && extensionElapsed < EXTENSION_DURATION_MS)
  const effectivelyPro = isPro || isTrialActive

  // Keep the user's own add-order (most recent first), not the screener's rank order.
  const stockByTicker = new Map(allStocks.map(s => [s.ticker, s]))
  const watchedStocks: ScreenerRow[] = (watchlistRows ?? [])
    .map(r => stockByTicker.get(r.ticker))
    .filter((s): s is ScreenerRow => !!s)

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-red-400 font-mono">Error loading watchlist.</p>
      </div>
    )
  }

  return (
    <div className="bg-black text-[#00ff41] min-h-screen" style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}>
      <NavHeightLogger />

      <div className="border-b border-[#00ff41]/20 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-lg sm:text-2xl font-bold tracking-[0.1em] sm:tracking-[0.3em] text-[#00ff41]">
            WATCHLIST
          </h1>
          <p className="text-[9px] sm:text-xs text-[#00ff41]/40 mt-1">
            {watchedStocks.length} STOCK{watchedStocks.length === 1 ? '' : 'S'} SAVED
          </p>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="max-w-7xl mx-auto">
          {watchedStocks.length === 0 ? (
            <div className="border border-[#00ff41]/15 rounded-lg px-6 py-16 text-center">
              <p className="text-sm text-[#00ff41]/60 mb-1">Your watchlist is empty.</p>
              <p className="text-xs text-[#00ff41]/30 mb-5">
                Tap the star next to any ticker in the screener to save it here.
              </p>
              <a
                href="/screener"
                className="inline-block bg-[#00ff41] text-black font-bold font-mono text-xs tracking-widest px-4 py-2 rounded hover:bg-[#00dd38] transition-colors"
              >
                GO TO SCREENER →
              </a>
            </div>
          ) : effectivelyPro ? (
            <ScreenerTableErrorBoundary>
              <ScreenerTable visibleStocks={watchedStocks} hasSession isPro />
            </ScreenerTableErrorBoundary>
          ) : (
            <div className="relative">
              <div className="blur-sm select-none pointer-events-none opacity-60">
                <ScreenerTableErrorBoundary>
                  <ScreenerTable visibleStocks={watchedStocks} hasSession isPro />
                </ScreenerTableErrorBoundary>
              </div>
              <div className="absolute inset-0 flex items-center justify-center px-6">
                <div className="bg-[#050505] border border-[#00ff41]/25 rounded-lg px-6 py-5 text-center shadow-lg shadow-black/60 max-w-xs">
                  <p className="text-xs font-bold tracking-widest text-[#00ff41] mb-1">
                    YOUR TRIAL HAS ENDED
                  </p>
                  <p className="text-[11px] text-[#00ff41]/50 mb-4">
                    Your {watchedStocks.length} saved stock{watchedStocks.length === 1 ? '' : 's'} {watchedStocks.length === 1 ? 'is' : 'are'} still here — upgrade to Pro to see them again.
                  </p>
                  <a
                    href="/pricing"
                    className="inline-block bg-[#00ff41] text-black font-bold font-mono text-xs tracking-widest px-4 py-2 rounded hover:bg-[#00dd38] transition-colors"
                  >
                    UPGRADE TO PRO →
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
