export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { getCachedUser } from '@/lib/server-auth'
import { isLaunchedStock } from '@/lib/constants'
import type { CSSProperties } from 'react'
import AggregateCharts, { type AggregateYear } from './AggregateCharts'
import ValuationTrendCharts, { type ValuationYear } from './ValuationTrendCharts'
import BottomNav from '@/components/ui/BottomNav'

const INTERNAL_EMAILS = ['mrepsiloned@gmail.com', 'stocksnack88@gmail.com']

// ── constants ──────────────────────────────────────────────────────────────────

const GREEN = '#00ff41'
const DIM   = 'rgba(0,255,65,0.4)'
const FAINT = 'rgba(0,255,65,0.1)'
const FONT: CSSProperties = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }

const SIGNALS = ['BUY+', 'BUY', 'HOLD', 'SELL'] as const
const SIGNAL_COLOR: Record<string, string> = {
  'BUY+': '#00ff41',
  'BUY':  '#22c55e',
  'HOLD': '#f59e0b',
  'SELL': '#ef4444',
}

const FUND_YEARS = [2021, 2022, 2023, 2024, 2025]

// ── styles ─────────────────────────────────────────────────────────────────────

const S = {
  page:    { background: '#000', color: GREEN, minHeight: '100vh', ...FONT } as CSSProperties,
  wrap:    { maxWidth: 896, margin: '0 auto', padding: '0 1.5rem 6rem' } as CSSProperties,
  section: { marginTop: '2rem' } as CSSProperties,
  head: {
    fontSize: 12, fontWeight: 'bold', letterSpacing: '0.1em',
    color: GREEN, margin: 0,
  } as CSSProperties,
  table:  { width: '100%', borderCollapse: 'collapse' as const, fontSize: 11 },
  th:     { textAlign: 'left' as const, color: 'rgba(0,255,65,0.35)', padding: '4px 10px 6px 0', fontWeight: 'normal', letterSpacing: '0.1em', fontSize: 9, borderBottom: '1px solid rgba(0,255,65,0.12)' },
  td:     { padding: '5px 10px 5px 0', borderBottom: '1px solid rgba(0,255,65,0.07)', verticalAlign: 'middle' as const },
}

// ── types ──────────────────────────────────────────────────────────────────────

type ScoreRow = {
  ticker: string
  final_score: number | null
  signal: string | null
  ppm_cagr: number | null
  pe_ratio: number | null
  fcf_yield: number | null
  div_yield: number | null
  stocks: { name: string | null; sector: string | null; index_tags: string[] | null } | { name: string | null; sector: string | null; index_tags: string[] | null }[] | null
}

type FundRow = {
  ticker: string
  fiscal_year: number
  revenue: number | null
  ebitda: number | null
  free_cash_flow: number | null
  dividends_paid: number | null
  net_income: number | null
  market_cap_at_year: number | null
  ev_to_ebitda: number | null
}

// ── helpers ───────────────────────────────────────────────────────────────────

function sectorOf(row: ScoreRow): string {
  const s = row.stocks
  if (!s) return 'Other'
  const ref = Array.isArray(s) ? s[0] : s
  return ref?.sector ?? 'Other'
}

function indexTagsOf(row: ScoreRow): string[] | null {
  const s = row.stocks
  if (!s) return null
  const ref = Array.isArray(s) ? s[0] : s
  return ref?.index_tags ?? null
}

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100)
}

function arrAvg(nums: number[]): number | null {
  return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function fmtPE(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}x`
}

function fmtPct(v: number | null, dec = 1): string {
  return v == null ? '—' : `${(v * 100).toFixed(dec)}%`
}

function fmtCagr(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}

function scoreColor(s: number): string {
  if (s >= 70) return GREEN
  if (s >= 50) return '#f59e0b'
  return '#ef4444'
}

function valStatus(
  val: number | null,
  cheapThresh: number,
  expThresh: number,
  higherIsCheap: boolean,
): { label: string; color: string } {
  if (val == null) return { label: '—', color: DIM }
  const cheap = higherIsCheap ? val > cheapThresh : val < cheapThresh
  const exp   = higherIsCheap ? val < expThresh   : val > expThresh
  if (cheap) return { label: 'CHEAP',     color: GREEN }
  if (exp)   return { label: 'EXPENSIVE', color: '#ef4444' }
  return { label: 'FAIR', color: '#f59e0b' }
}

// ── data ──────────────────────────────────────────────────────────────────────

const getMarketData = unstable_cache(
  async () => {
    const [{ data: scoresRaw }, { data: fundRaw }] = await Promise.all([
      fetchAllRows((start, end) =>
        supabaseAdmin
          .from('stock_scores')
          .select('ticker, final_score, signal, ppm_cagr, pe_ratio, fcf_yield, div_yield, stocks(name, sector, index_tags)')
          .order('final_score', { ascending: false })
          .range(start, end)
      ),
      fetchAllRows((start, end) =>
        supabaseAdmin
          .from('stock_fundamentals')
          .select('ticker, fiscal_year, revenue, ebitda, free_cash_flow, dividends_paid, net_income, market_cap_at_year, ev_to_ebitda')
          .gte('fiscal_year', 2021)
          .lte('fiscal_year', 2025)
          .range(start, end)
      ),
    ])
    // Backend can freely ingest S&P 400/600 ahead of launch — keep this "S&P 500
    // aggregate" page true to its label until index_tags says otherwise.
    const scores = ((scoresRaw ?? []) as unknown as ScoreRow[]).filter((r) => isLaunchedStock(indexTagsOf(r)))
    return {
      scores,
      fund:   (fundRaw   ?? []) as FundRow[],
    }
  },
  ['market-v3-data'],
  { revalidate: 3600 },
)

// ── page ──────────────────────────────────────────────────────────────────────

export default async function MarketPage() {
  const user = await getCachedUser()
  if (!user || !INTERNAL_EMAILS.includes(user.email ?? '')) redirect('/screener')

  const { scores, fund } = await getMarketData()

  // ── sector map from scores ──────────────────────────────────────────────────
  const sectorMap = new Map<string, string>()
  for (const s of scores) sectorMap.set(s.ticker, sectorOf(s))

  // ── signal distribution ─────────────────────────────────────────────────────
  const total = scores.length
  const sigCounts: Record<string, number> = { 'BUY+': 0, 'BUY': 0, 'HOLD': 0, 'SELL': 0 }
  for (const r of scores) {
    if (r.signal && sigCounts[r.signal] !== undefined) sigCounts[r.signal]++
  }

  const bullishCount  = sigCounts['BUY+'] + sigCounts['BUY']
  const bullishPct    = pct(bullishCount, total)
  const sentiment     = bullishPct > 50 ? 'CHEAP' : bullishPct >= 30 ? 'FAIRLY VALUED' : 'EXPENSIVE'
  const sentimentColor =
    sentiment === 'CHEAP' ? GREEN : sentiment === 'FAIRLY VALUED' ? '#ffcc00' : '#ef4444'

  // ── market valuation ────────────────────────────────────────────────────────
  const peVals  = scores.map(r => r.pe_ratio).filter((v): v is number => v != null && v > 0 && v < 200)
  const fcfVals = scores.map(r => r.fcf_yield).filter((v): v is number => v != null && v > 0 && v < 0.5)
  const divVals = scores.map(r => r.div_yield).filter((v): v is number => v != null && v > 0 && v < 0.15)

  const avgPE  = arrAvg(peVals)
  const avgFCF = arrAvg(fcfVals)
  const avgDiv = arrAvg(divVals)

  const peStatus  = valStatus(avgPE,  19,    22,    false)
  const fcfStatus = valStatus(avgFCF, 0.035, 0.032, true)
  const divStatus = valStatus(avgDiv, 0.018, 0.013, true)

  // Marker position 0-100 (0=cheap left, 100=expensive right)
  const peMarker  = avgPE  != null ? clamp((avgPE  - 10) / 20  * 100, 1, 99) : 50
  const fcfMarker = avgFCF != null ? clamp((1 - avgFCF / 0.08) * 100, 1, 99) : 50
  const divMarker = avgDiv != null ? clamp((1 - avgDiv / 0.04) * 100, 1, 99) : 50

  // ── sector rankings ─────────────────────────────────────────────────────────
  type SectorStat = {
    count: number; scoreSum: number; cagrSum: number; cagrCount: number
    signals: Record<string, number>
  }
  const sectorStats = new Map<string, SectorStat>()
  for (const r of scores) {
    const sector = sectorOf(r)
    if (!sectorStats.has(sector)) {
      sectorStats.set(sector, {
        count: 0, scoreSum: 0, cagrSum: 0, cagrCount: 0,
        signals: { 'BUY+': 0, 'BUY': 0, 'HOLD': 0, 'SELL': 0 },
      })
    }
    const s = sectorStats.get(sector)!
    s.count++
    if (r.final_score != null) s.scoreSum += r.final_score
    if (r.ppm_cagr    != null) { s.cagrSum += r.ppm_cagr; s.cagrCount++ }
    if (r.signal && s.signals[r.signal] !== undefined) s.signals[r.signal]++
  }

  const sectorRows = Array.from(sectorStats.entries())
    .map(([sector, s]) => ({
      sector,
      count:    s.count,
      avgScore: s.count    > 0 ? s.scoreSum / s.count    : 0,
      avgCagr:  s.cagrCount > 0 ? s.cagrSum  / s.cagrCount : null,
      signals:  s.signals,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)

  const totalSectors = sectorRows.length

  // ── signal funnel ────────────────────────────────────────────────────────────
  // Narrowing tiers, upside-down-pyramid style: total screened -> hold-or-better
  // -> buy-or-better -> buy+ only.
  const holdOrBetter = sigCounts['HOLD'] + sigCounts['BUY'] + sigCounts['BUY+']
  const buyOrBetter  = sigCounts['BUY'] + sigCounts['BUY+']
  const funnelTiers = [
    { label: 'TOTAL SCREENED',   count: total,          pctOfTotal: 100 },
    { label: 'HOLD OR BETTER',   count: holdOrBetter,   pctOfTotal: pct(holdOrBetter, total) },
    { label: 'BUY OR BETTER',    count: buyOrBetter,     pctOfTotal: pct(buyOrBetter, total) },
    { label: 'BUY+ ONLY',        count: sigCounts['BUY+'], pctOfTotal: pct(sigCounts['BUY+'], total) },
  ]

  // ── raw fundamentals by year (sum across the universe) ─────────────────────
  const aggMap = new Map<number, { rev: number; ebitda: number; fcf: number; div: number }>()
  for (const y of FUND_YEARS) aggMap.set(y, { rev: 0, ebitda: 0, fcf: 0, div: 0 })

  // ── market valuation by year (avg multiple/yield across the universe) ──────
  type ValAcc = {
    peSum: number; peN: number
    evSum: number; evN: number
    fcfYSum: number; fcfYN: number
    divYSum: number; divYN: number
  }
  const valMap = new Map<number, ValAcc>()
  for (const y of FUND_YEARS) valMap.set(y, { peSum: 0, peN: 0, evSum: 0, evN: 0, fcfYSum: 0, fcfYN: 0, divYSum: 0, divYN: 0 })

  for (const row of fund) {
    const y = row.fiscal_year

    const agg = aggMap.get(y)
    if (agg) {
      if (row.revenue        != null) agg.rev    += row.revenue
      if (row.ebitda         != null) agg.ebitda += row.ebitda
      if (row.free_cash_flow != null) agg.fcf    += row.free_cash_flow
      if (row.dividends_paid != null) agg.div    += Math.abs(row.dividends_paid)
    }

    const v = valMap.get(y)
    if (v) {
      const mcap = row.market_cap_at_year
      if (mcap != null && mcap > 0) {
        if (row.net_income != null && row.net_income > 0) {
          const peY = mcap / row.net_income
          if (peY > 0 && peY < 200) { v.peSum += peY; v.peN++ }
        }
        if (row.free_cash_flow != null && row.free_cash_flow > 0) {
          const fcfYieldY = row.free_cash_flow / mcap
          if (fcfYieldY > 0 && fcfYieldY < 0.5) { v.fcfYSum += fcfYieldY; v.fcfYN++ }
        }
        if (row.dividends_paid != null && row.dividends_paid !== 0) {
          const divYieldY = Math.abs(row.dividends_paid) / mcap
          if (divYieldY > 0 && divYieldY < 0.15) { v.divYSum += divYieldY; v.divYN++ }
        }
      }
      if (row.ev_to_ebitda != null && row.ev_to_ebitda > 0 && row.ev_to_ebitda < 200) {
        v.evSum += row.ev_to_ebitda; v.evN++
      }
    }
  }

  const aggregateYears: AggregateYear[] = FUND_YEARS.map(y => {
    const a = aggMap.get(y)!
    return {
      year:      y,
      revenue:   a.rev    || null,
      ebitda:    a.ebitda || null,
      fcf:       a.fcf    || null,
      dividends: a.div    || null,
    }
  })

  const valuationYears: ValuationYear[] = FUND_YEARS.map(y => {
    const v = valMap.get(y)!
    return {
      year:      y,
      pe:        v.peN    > 0 ? v.peSum    / v.peN    : null,
      evEbitda:  v.evN    > 0 ? v.evSum    / v.evN    : null,
      fcfYield:  v.fcfYN  > 0 ? v.fcfYSum  / v.fcfYN  : null,
      divYield:  v.divYN  > 0 ? v.divYSum  / v.divYN  : null,
    }
  })

  // ── market sentiment summary ────────────────────────────────────────────────
  // Rule-based read: compare the direction (and, when both move the same way,
  // the relative magnitude) of aggregate earnings (EBITDA) against the average
  // valuation multiple (EV/EBITDA) over the same window. Not a model output --
  // a transparent, explainable comparison.
  function pctChange(first: number | null, last: number | null): number | null {
    if (first == null || last == null || first === 0) return null
    return (last - first) / Math.abs(first)
  }
  function trendDirection(change: number | null, upThresh: number): 'up' | 'down' | 'flat' {
    if (change == null) return 'flat'
    if (change > upThresh) return 'up'
    if (change < -upThresh) return 'down'
    return 'flat'
  }
  const firstEbitda = aggregateYears[0]?.ebitda ?? null
  const lastEbitda  = aggregateYears[aggregateYears.length - 1]?.ebitda ?? null
  const firstEv     = valuationYears.find(v => v.evEbitda != null)?.evEbitda ?? null
  const lastEv      = [...valuationYears].reverse().find(v => v.evEbitda != null)?.evEbitda ?? null
  const earningsChange  = pctChange(firstEbitda, lastEbitda)
  const valuationChange = pctChange(firstEv, lastEv)
  const earningsDir     = trendDirection(earningsChange, 0.03)
  const valuationDir    = trendDirection(valuationChange, 0.05)

  const sentimentCopy: Record<string, string> = {
    'up|down':   'Earnings are growing while valuations are contracting — the market hasn\'t caught up to the fundamentals yet.',
    'up|flat':   'Earnings are growing and valuations have stayed roughly flat — growth is being priced in for free.',
    'up|up_faster':    'Earnings are growing, but valuations are expanding even faster — the market is already pricing in the improvement.',
    'up|up_slower':    'Earnings are growing faster than valuations are expanding — the market hasn\'t fully caught up to the improvement yet.',
    'flat|down': 'Earnings are steady while valuations compress — the market is paying less for the same business.',
    'flat|flat': 'Both earnings and valuations are roughly flat — no major re-rating happening either way.',
    'flat|up':   'Earnings are flat but valuations are expanding — multiples are doing the work, not the business.',
    'down|down_faster': 'Earnings and valuations are both pulling back, with valuations falling faster — the market is de-rating ahead of the business.',
    'down|down_slower': 'Earnings and valuations are both pulling back, with earnings falling faster — the market hasn\'t fully priced in the weakness yet.',
    'down|flat': 'Earnings are declining while valuations hold — the market may not have caught up to the weakness yet.',
    'down|up':   'Earnings are declining even as valuations expand — worth watching closely.',
  }
  const sameDirSuffix = (earningsChange != null && valuationChange != null && Math.abs(valuationChange) > Math.abs(earningsChange)) ? 'faster' : 'slower'
  const sentimentKey =
    (earningsDir === 'up' && valuationDir === 'up')     ? `up|up_${sameDirSuffix}` :
    (earningsDir === 'down' && valuationDir === 'down') ? `down|down_${sameDirSuffix}` :
    `${earningsDir}|${valuationDir}`
  const sentimentSummary = sentimentCopy[sentimentKey] ?? sentimentCopy['flat|flat']

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      <div style={S.wrap}>

        {/* ── HERO ── */}
        <div style={{
          borderBottom: `1px solid ${FAINT}`,
          padding: '2.5rem 0 2rem',
        }}>
          <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.25em', margin: '0 0 14px' }}>
            STOCKSNACK · S&P 500 MARKET OVERVIEW
          </p>
          <p style={{ fontSize: 'clamp(16px, 2.5vw, 22px)', fontWeight: 'bold', lineHeight: 1.4, margin: 0, letterSpacing: '0.03em' }}>
            <span style={{ color: GREEN }}>{bullishPct}%</span>
            <span style={{ color: 'rgba(0,255,65,0.75)' }}> of S&P 500 stocks are projected to beat the market right now — </span>
            <span style={{ color: 'rgba(0,255,65,0.75)' }}>the market is </span>
            <span style={{ color: sentimentColor }}>{sentiment}</span>
            <span style={{ color: 'rgba(0,255,65,0.75)' }}> by StockSnack&apos;s scoring.</span>
          </p>
        </div>

        {/* ── SECTION 1: SIGNAL FUNNEL ── */}
        <div style={S.section}>
          <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ background: '#001a00', borderBottom: '1px solid rgba(0,255,65,0.1)', padding: '1rem 1.25rem' }}>
              <p style={S.head}>01 — SIGNAL FUNNEL</p>
              <p style={{ fontSize: 11, color: DIM, margin: 0, letterSpacing: '0.08em' }}>
                Where {total} stocks stand today
              </p>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {funnelTiers.map((tier, i) => (
                  <div key={tier.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      flex: Math.max(tier.pctOfTotal, 4) / 100,
                      marginLeft: `${i * 8}%`,
                      height: 34,
                      background: i === 0 ? 'rgba(0,255,65,0.10)' : i === 1 ? 'rgba(0,255,65,0.18)' : i === 2 ? 'rgba(0,255,65,0.30)' : '#00ff41',
                      display: 'flex', alignItems: 'center', padding: '0 16px',
                      fontSize: 11, fontWeight: 'bold', letterSpacing: '0.05em',
                      color: i === 3 ? '#000' : GREEN,
                      whiteSpace: 'nowrap', transition: 'flex 0.3s',
                    }}>
                      {tier.label}
                    </div>
                    <div style={{ width: 70, textAlign: 'right', fontSize: 13, fontWeight: 'bold', flexShrink: 0 }}>
                      {tier.count}
                    </div>
                    <div style={{ width: 40, textAlign: 'right', fontSize: 9, color: DIM, flexShrink: 0 }}>
                      {tier.pctOfTotal}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 2: RAW FUNDAMENTAL TRENDS ── */}
        <div style={S.section}>
          <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ background: '#001a00', borderBottom: '1px solid rgba(0,255,65,0.1)', padding: '1rem 1.25rem' }}>
              <p style={S.head}>02 — RAW FUNDAMENTAL TRENDS — SUM ACROSS UNIVERSE (FY21–FY25)</p>
              <p style={{ fontSize: 11, color: DIM, margin: '4px 0 0', letterSpacing: '0.08em' }}>
                What the businesses are actually doing, before the market prices it
              </p>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <AggregateCharts data={aggregateYears} />
            </div>
          </div>
        </div>

        {/* ── SECTION 3: MARKET VALUATION ── */}
        <div style={S.section}>
          <p style={{ ...S.head, marginBottom: '0.75rem' }}>03 — MARKET VALUATION — S&P 500 AVERAGE</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <ValuationCard
              label="P/E RATIO"
              displayValue={fmtPE(avgPE)}
              benchmark="CHEAP < 19x  ·  FAIR 19–22x  ·  EXPENSIVE > 22x"
              markerPct={peMarker}
              status={peStatus}
            />
            <ValuationCard
              label="FCF YIELD"
              displayValue={fmtPct(avgFCF)}
              benchmark="CHEAP > 3.5%  ·  FAIR 3.2–3.5%  ·  EXPENSIVE < 3.2%"
              markerPct={fcfMarker}
              status={fcfStatus}
            />
            <ValuationCard
              label="DIVIDEND YIELD"
              displayValue={fmtPct(avgDiv)}
              benchmark="CHEAP > 1.8%  ·  FAIR 1.3–1.8%  ·  EXPENSIVE < 1.3%"
              markerPct={divMarker}
              status={divStatus}
            />
          </div>
          <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ background: '#001a00', borderBottom: '1px solid rgba(0,255,65,0.1)', padding: '1rem 1.25rem' }}>
              <p style={{ ...S.head, fontSize: 10, letterSpacing: '0.08em', color: DIM }}>HOW WE GOT HERE — AVG MULTIPLE/YIELD BY YEAR (FY21–FY25)</p>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <ValuationTrendCharts data={valuationYears} />
            </div>
          </div>
        </div>

        {/* ── SECTION 4: MARKET SENTIMENT SUMMARY ── */}
        <div style={S.section}>
          <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ background: '#001a00', borderBottom: '1px solid rgba(0,255,65,0.1)', padding: '1rem 1.25rem' }}>
              <p style={S.head}>04 — MARKET SENTIMENT SUMMARY</p>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(0,255,65,0.8)', margin: 0 }}>
                {sentimentSummary}
              </p>
              <p style={{ fontSize: 9, color: 'rgba(0,255,65,0.25)', margin: '10px 0 0', letterSpacing: '0.04em' }}>
                Based on aggregate EBITDA trend ({earningsDir}) vs. average EV/EBITDA trend ({valuationDir}), FY21→FY25.
              </p>
            </div>
          </div>
        </div>

        {/* ── SECTION 5: SECTOR RANKINGS ── */}
        <div style={S.section}>
          <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ background: '#001a00', borderBottom: '1px solid rgba(0,255,65,0.1)', padding: '1rem 1.25rem' }}>
              <p style={S.head}>05 — SECTOR RANKINGS — SORTED BY AVG SCORE</p>
            </div>
            <div style={{ padding: '0 1.25rem', overflowX: 'auto' }}>
              <table style={{ ...S.table, fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}>
                <thead>
                  <tr>
                    <th style={S.th}>SECTOR</th>
                    <th style={{ ...S.th, textAlign: 'right' as const }}>STOCKS</th>
                    <th style={{ ...S.th, textAlign: 'right' as const }}>AVG SCORE</th>
                    <th style={{ ...S.th, textAlign: 'right' as const }}>AVG CAGR</th>
                    {SIGNALS.map(s => (
                      <th key={s} style={{ ...S.th, textAlign: 'right' as const, color: SIGNAL_COLOR[s] }}>{s}</th>
                    ))}
                    <th style={{ ...S.th, textAlign: 'right' as const }}>VERDICT</th>
                  </tr>
                </thead>
                <tbody>
                  {sectorRows.map((r, i) => {
                    const verdict =
                      i < 3                     ? 'Leading' :
                      i >= totalSectors - 3     ? 'Lagging' : 'Neutral'
                    const verdictColor =
                      verdict === 'Leading' ? GREEN :
                      verdict === 'Lagging' ? '#ef4444' : DIM
                    return (
                      <tr key={r.sector}>
                        <td style={S.td}>{r.sector}</td>
                        <td style={{ ...S.td, textAlign: 'right' as const, color: DIM }}>{r.count}</td>
                        <td style={{ ...S.td, textAlign: 'right' as const, fontWeight: 'bold', color: scoreColor(r.avgScore) }}>
                          {r.avgScore.toFixed(1)}
                        </td>
                        <td style={{ ...S.td, textAlign: 'right' as const, color: DIM }}>
                          {fmtCagr(r.avgCagr)}
                        </td>
                        {SIGNALS.map(sig => (
                          <td key={sig} style={{ ...S.td, textAlign: 'right' as const, color: r.signals[sig] > 0 ? SIGNAL_COLOR[sig] : DIM }}>
                            {r.signals[sig] > 0 ? r.signals[sig] : '—'}
                          </td>
                        ))}
                        <td style={{ ...S.td, textAlign: 'right' as const, fontWeight: 'bold', fontSize: 9, letterSpacing: '0.1em', color: verdictColor }}>
                          {verdict.toUpperCase()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── footer ── */}
        <p style={{
          marginTop: '2.5rem', paddingTop: '1rem',
          borderTop: `1px solid ${FAINT}`,
          fontSize: 9, color: 'rgba(0,255,65,0.2)',
          textAlign: 'center', letterSpacing: '0.15em',
        }}>
          STOCKSNACK · MARKET OVERVIEW · DATA UPDATED WEEKLY
        </p>

      </div>
      <BottomNav />
    </div>
  )
}

// ── sub-components ─────────────────────────────────────────────────────────────

function ValuationCard({
  label, displayValue, benchmark, markerPct, status,
}: {
  label: string
  displayValue: string
  benchmark: string
  markerPct: number
  status: { label: string; color: string }
}) {
  return (
    <div style={{
      border: '1px solid rgba(0,255,65,0.2)',
      background: 'rgba(0,255,65,0.02)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      {/* card header */}
      <div style={{
        background: '#001a00',
        borderBottom: '1px solid rgba(0,255,65,0.1)',
        padding: '0.75rem 1.25rem',
      }}>
        <p style={{ fontSize: 9, color: 'rgba(0,255,65,0.4)', letterSpacing: '0.18em', margin: 0, fontWeight: 'bold' }}>{label}</p>
      </div>

      {/* card body */}
      <div style={{ padding: '1rem 1.25rem 1.25rem' }}>
        <p style={{ fontSize: 30, fontWeight: 'bold', margin: '0 0 14px', color: status.color }}>{displayValue}</p>

        {/* spectrum bar with marker */}
        <div style={{ position: 'relative', marginBottom: 18 }}>
          <div style={{
            display: 'flex', height: 7, borderRadius: 3, overflow: 'visible',
            position: 'relative',
          }}>
            <div style={{ flex: 1, background: '#00ff41', opacity: 0.55, borderRadius: '3px 0 0 3px' }} />
            <div style={{ flex: 1, background: '#f59e0b', opacity: 0.55 }} />
            <div style={{ flex: 1, background: '#ef4444', opacity: 0.55, borderRadius: '0 3px 3px 0' }} />
          </div>
          {/* marker */}
          <div style={{
            position: 'absolute',
            left: `${markerPct}%`,
            top: -3,
            width: 3,
            height: 13,
            background: '#fff',
            borderRadius: 2,
            transform: 'translateX(-50%)',
            boxShadow: '0 0 4px rgba(255,255,255,0.6)',
          }} />
        </div>

        {/* zone labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7, color: 'rgba(0,255,65,0.25)', marginBottom: 10 }}>
          <span>CHEAP</span>
          <span>FAIR</span>
          <span>EXPENSIVE</span>
        </div>

        {/* benchmark */}
        <p style={{ fontSize: 8, color: 'rgba(0,255,65,0.25)', margin: '0 0 10px', lineHeight: 1.6 }}>
          {benchmark}
        </p>

        <p style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.15em', color: status.color, margin: 0 }}>
          {status.label}
        </p>
      </div>
    </div>
  )
}
