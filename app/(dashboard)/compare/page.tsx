export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getCachedUser, getCachedUserProfile } from '@/lib/server-auth'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import type { CSSProperties } from 'react'
import CompareInputs from './CompareInputs'
import { CompareMetricTable } from './CompareMetricTable'
import { getCompareData, type Mode } from './compareData'
import type { TickerOption } from './TickerTypeahead'

const GREEN  = '#00ff41'
const DIM    = 'rgba(0,255,65,0.4)'
const FAINT  = 'rgba(0,255,65,0.1)'
const MONO: CSSProperties = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }

const PLACEHOLDER_SECTIONS = [
  'OVERVIEW',
  'LAYER 1 — PRICE PROJECTION',
  'LAYER 2 — GROWTH QUALITY',
  'LAYER 3 — FINANCIAL HEALTH',
  'LAYER 4 — FINAL SCORE',
  'MARKET COMPARISON',
]

function PlaceholderCard({ title }: { title: string }) {
  return (
    <div style={{
      border: '1px solid rgba(0,255,65,0.2)',
      background: 'rgba(0,255,65,0.02)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      <div style={{
        background: '#001a00',
        borderBottom: `1px solid ${FAINT}`,
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <p style={{
          fontSize: 12, fontWeight: 'bold', letterSpacing: '0.1em',
          color: GREEN, margin: 0, ...MONO,
        }}>
          {title}
        </p>
        <span style={{ fontSize: 9, color: 'rgba(0,255,65,0.2)', letterSpacing: '0.1em', ...MONO }}>
          COMING SOON
        </span>
      </div>
      <div style={{
        padding: '2rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 80,
      }}>
        <p style={{ fontSize: 9, color: 'rgba(0,255,65,0.15)', letterSpacing: '0.15em', ...MONO, margin: 0 }}>
          — DATA NOT YET POPULATED —
        </p>
      </div>
    </div>
  )
}

function ErrorCard({ ticker }: { ticker: string }) {
  return (
    <div style={{
      border: '1px solid rgba(239,68,68,0.3)',
      background: 'rgba(239,68,68,0.05)',
      borderRadius: 4,
      padding: '1.25rem',
      color: '#f87171',
      fontSize: 12,
      letterSpacing: '0.05em',
    }}>
      {ticker ? `TICKER "${ticker}" NOT FOUND — check the spelling and try again.` : 'SELECT A SECOND TICKER TO COMPARE.'}
    </div>
  )
}

const VALID_MODES: Mode[] = ['STOCK_VS_STOCK', 'STOCK_VS_SP500', 'STOCK_VS_INDUSTRY']

export default async function ComparePage({
  searchParams,
}: {
  searchParams: { mode?: string; tickerA?: string; tickerB?: string }
}) {
  // Page itself has no login gate, same as /market -- anyone can load
  // /compare and see the mode/ticker controls. The actual comparison data
  // below is Pro-only (see isPro check further down), matching Market's
  // "Signal Funnel free, everything else Pro" pattern.
  const user = await getCachedUser()
  let isPro = false
  if (user) {
    const profile = await getCachedUserProfile(user.id)
    isPro = profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing'
  }

  // Default to a real, already-populated comparison rather than an empty
  // input screen -- an empty state with grey placeholder text ("AAPL")
  // reads as already-filled-in and confused first-time visitors into
  // thinking the page was broken when the section below stayed blank.
  const mode: Mode = VALID_MODES.includes(searchParams.mode as Mode) ? (searchParams.mode as Mode) : 'STOCK_VS_STOCK'
  const tickerA = (searchParams.tickerA ?? 'AAPL').toUpperCase()
  const tickerB = (searchParams.tickerB ?? 'MSFT').toUpperCase()
  const hasSelection = tickerA.length > 0 && (mode !== 'STOCK_VS_STOCK' || tickerB.length > 0)

  const { data: tickerRows } = await fetchAllRows<{ ticker: string; name: string | null }>(
    (start, end) => supabaseAdmin.from('stocks').select('ticker,name').range(start, end)
  )
  const options: TickerOption[] = tickerRows

  // Skip the actual comparison fetch entirely for non-Pro viewers -- they
  // see the upgrade card instead, so there's nothing to compute it for.
  const result = hasSelection && isPro ? await getCompareData(mode, tickerA, mode === 'STOCK_VS_STOCK' ? tickerB : null) : null

  return (
    <div style={{ background: '#000', color: GREEN, minHeight: '100vh', ...MONO }}>
      <div style={{ maxWidth: 896, margin: '0 auto', padding: '0 1.5rem 4rem' }}>

        {/* hero + filter controls -- controls live inside the hero, not a
            separate content-styled card, so the border below the hero is
            the one clear line between "picking what to compare" and the
            actual comparison content */}
        <div style={{ borderBottom: `1px solid ${FAINT}`, padding: '2.5rem 0 1.75rem' }}>
          <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.25em', margin: '0 0 10px' }}>
            STOCKSNACK · STOCK COMPARE
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 'bold', letterSpacing: '0.05em', margin: 0 }}>
            COMPARE
          </h1>
          <p style={{ fontSize: 11, color: DIM, margin: '6px 0 1.25rem', letterSpacing: '0.08em' }}>
            Side-by-side analysis — stock vs stock, vs S&P 500, or vs industry average.
          </p>
          <CompareInputs options={options} initialMode={mode} initialTickerA={tickerA} initialTickerB={tickerB} />
        </div>

        {/* results */}
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {!isPro ? (
            <div style={{
              border: '1px solid rgba(0,255,65,0.25)', borderRadius: 6,
              background: 'rgba(0,255,65,0.02)', padding: '2.5rem 1.5rem', textAlign: 'center',
            }}>
              <p style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.15em', color: DIM, margin: '0 0 8px' }}>
                STOCKSNACK PRO
              </p>
              <p style={{ fontSize: 16, fontWeight: 'bold', color: GREEN, margin: '0 0 8px' }}>
                Unlock stock comparison
              </p>
              <p style={{ fontSize: 12, color: DIM, lineHeight: 1.6, maxWidth: 380, margin: '0 auto 20px' }}>
                Side-by-side metrics, benchmarks vs S&amp;P 500 and industry average, and a full win/loss breakdown — all Pro-only.
              </p>
              <Link
                href="/api/subscribe"
                style={{
                  display: 'inline-block', background: GREEN, color: '#000', fontWeight: 'bold',
                  fontSize: 12, letterSpacing: '0.08em', padding: '10px 28px', borderRadius: 6, textDecoration: 'none',
                }}
              >
                UPGRADE TO PRO →
              </Link>
              <p style={{ fontSize: 10, color: 'rgba(0,255,65,0.3)', margin: '10px 0 0' }}>$20/mo</p>
            </div>
          ) : (
            <>
          {!hasSelection && PLACEHOLDER_SECTIONS.map(title => (
            <PlaceholderCard key={title} title={title} />
          ))}

          {hasSelection && result && !result.ok && (
            <ErrorCard ticker={result.error === 'not_found' ? result.ticker : ''} />
          )}

          {hasSelection && result && result.ok && (
            <>
              {/* overall winner tally */}
              <div style={{
                border: '1px solid rgba(0,255,65,0.2)',
                background: 'rgba(0,255,65,0.02)',
                borderRadius: 4,
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}>
                <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.15em', margin: 0 }}>
                  METRICS WON
                </p>
                <p style={{ fontSize: 13, fontWeight: 'bold', letterSpacing: '0.08em', margin: 0 }}>
                  <span style={{ color: result.tally.aWins >= result.tally.bWins ? GREEN : DIM }}>
                    {result.labelA} {result.tally.aWins}
                  </span>
                  <span style={{ color: DIM, margin: '0 10px' }}>—</span>
                  <span style={{ color: result.tally.bWins >= result.tally.aWins ? GREEN : DIM }}>
                    {result.tally.bWins} {result.labelB}
                  </span>
                  <span style={{ color: 'rgba(251,191,36,0.6)', marginLeft: 10, fontSize: 10 }}>
                    ({result.tally.ties} TIE{result.tally.ties === 1 ? '' : 'S'})
                  </span>
                </p>
              </div>

              {result.sections.map(section => (
                <CompareMetricTable key={section.title} section={section} labelA={result.labelA} labelB={result.labelB} />
              ))}
            </>
          )}
            </>
          )}
        </div>

        {/* footer */}
        <p style={{
          marginTop: '2.5rem', paddingTop: '1rem',
          borderTop: `1px solid ${FAINT}`,
          fontSize: 9, color: 'rgba(0,255,65,0.2)',
          textAlign: 'center', letterSpacing: '0.15em',
          margin: '2.5rem 0 0',
        }}>
          STOCKSNACK · COMPARE
        </p>

      </div>
    </div>
  )
}
