export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import type { CSSProperties } from 'react'
import MetricChartPicker, { type MetricDef, type YearRow } from './MetricChartPicker'
import GrowthComparisonChart from './GrowthComparisonChart'
import SignalFunnel from './SignalFunnel'
import BottomNav from '@/components/ui/BottomNav'

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

// Universe groups, driven by stocks.index_tags. 'ALL' spans everything we've
// pulled (S&P 500+400+600); the rest filter to one index tag. Extend this
// list as new tag groups (NASDAQ, custom watchlists, etc.) get added.
// SP400/SP600 are real indices (S&P MidCap 400 / S&P SmallCap 600) -- using
// their official names here since "S&P 400"/"S&P 600" alone reads as made up.
const GROUPS = [
  { key: 'ALL',   label: 'ALL',              noun: 'all tracked',       tag: null as string | null },
  { key: 'SP500', label: 'S&P 500',          noun: 'S&P 500',           tag: 'SP500' },
  { key: 'SP400', label: 'S&P MidCap 400',   noun: 'S&P MidCap 400',    tag: 'SP400' },
  { key: 'SP600', label: 'S&P SmallCap 600', noun: 'S&P SmallCap 600',  tag: 'SP600' },
] as const

// ── styles ─────────────────────────────────────────────────────────────────────

const S = {
  page:    { background: '#000', color: GREEN, minHeight: '100vh', ...FONT } as CSSProperties,
  wrap:    { maxWidth: 896, margin: '0 auto', padding: '0 1.5rem 6rem' } as CSSProperties,
  section: { marginTop: '2rem' } as CSSProperties,
  head: {
    fontSize: 12, fontWeight: 'bold', letterSpacing: '0.1em',
    color: GREEN, margin: 0,
  } as CSSProperties,
  // 'separate' (not 'collapse') -- border-collapse breaks position:sticky
  // cells in a well-known cross-browser way: the collapsed border paints in
  // a layer the sticky cell's background doesn't fully cover, so scrolled
  // content bleeds through at the sticky column boundary during horizontal
  // scroll. Only borderBottom is used anywhere in this table, so 'separate'
  // renders identically -- there's no vertical/adjacent-row border to double.
  table:  { width: '100%', borderCollapse: 'separate' as const, borderSpacing: 0, fontSize: 11 },
  th:     { textAlign: 'left' as const, color: 'rgba(0,255,65,0.35)', padding: '4px 10px 6px 0', fontWeight: 'normal', letterSpacing: '0.1em', fontSize: 9, borderBottom: '1px solid rgba(0,255,65,0.12)' },
  td:     { padding: '5px 10px 5px 0', borderBottom: '1px solid rgba(0,255,65,0.07)', verticalAlign: 'middle' as const },
}

// sticky first-two-columns widths (sector rankings table)
const STICKY_COL1_W = 130
const STICKY_COL2_W = 64
const STICKY_TH_BG = '#001a00'
const STICKY_TD_BG = '#000502'

// ── types ──────────────────────────────────────────────────────────────────────

type ScoreRow = {
  ticker: string
  final_score: number | null
  signal: string | null
  ppm_cagr: number | null
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

function nameOf(row: ScoreRow): string | null {
  const s = row.stocks
  if (!s) return null
  const ref = Array.isArray(s) ? s[0] : s
  return ref?.name ?? null
}

function indexTagsOf(row: ScoreRow): string[] {
  const s = row.stocks
  const ref = s ? (Array.isArray(s) ? s[0] : s) : null
  const tags = ref?.index_tags
  return tags && tags.length > 0 ? tags : ['SP500'] // fails open, matches lib/constants.ts convention
}

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100)
}

function fmtCagr(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}

function scoreColor(s: number): string {
  if (s >= 70) return GREEN
  if (s >= 50) return '#f59e0b'
  return '#ef4444'
}

// ── data ──────────────────────────────────────────────────────────────────────
// Fetches the FULL universe (S&P 500+400+600) once, cached. Group filtering
// happens per-request below, driven by ?group= — cheap in-memory filtering,
// no need to re-query per group.

const getMarketData = unstable_cache(
  async () => {
    const [{ data: scoresRaw }, { data: fundRaw }] = await Promise.all([
      fetchAllRows((start, end) =>
        supabaseAdmin
          .from('stock_scores')
          .select('ticker, final_score, signal, ppm_cagr, stocks(name, sector, index_tags)')
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
    return {
      scores: (scoresRaw ?? []) as unknown as ScoreRow[],
      fund:   (fundRaw   ?? []) as FundRow[],
    }
  },
  ['market-v4-data'],
  { revalidate: 3600 },
)

// ── page ──────────────────────────────────────────────────────────────────────

export default async function MarketPage({
  searchParams,
}: {
  searchParams: { group?: string }
}) {
  // Access gate intentionally removed 2026-08-01 (no live users yet -- see
  // CLAUDE.md). Re-add before real customers are on the platform: an
  // internal-email check (getCachedUser + redirect) previously lived here.

  const { scores: allScores, fund: allFund } = await getMarketData()

  const activeGroup = GROUPS.find(g => g.key === searchParams.group) ?? GROUPS.find(g => g.key === 'SP500')!
  const groupScores = activeGroup.tag == null
    ? allScores
    : allScores.filter(r => indexTagsOf(r).includes(activeGroup.tag as string))

  // Dual-class companies (GOOG/GOOGL, NWS/NWSA, UA/UAA, FOX/FOXA, CENT/CENTA,
  // ...) file one set of consolidated financials shared by both tickers --
  // summing/averaging across every ticker on this page would double-count
  // those companies. Keep one ticker per company name (alphabetically first,
  // arbitrary but deterministic -- financials are identical either way, so
  // it doesn't change any number, just which ticker symbol represents it).
  // The actual /screener page is untouched and still lists every ticker
  // individually, which is correct there.
  const seenNames = new Set<string>()
  const scores = [...groupScores]
    .sort((a, b) => a.ticker.localeCompare(b.ticker))
    .filter(r => {
      const name = nameOf(r)
      if (name == null) return true // no name on file -- can't dedupe, keep it
      if (seenNames.has(name)) return false
      seenNames.add(name)
      return true
    })

  const tickerSet = new Set(scores.map(r => r.ticker))
  const fund = allFund.filter(r => tickerSet.has(r.ticker))

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
  // -> buy-or-better -> buy+ only. widthPct drives the ACTUAL rendered bar
  // width (min-clamped only for visibility, never for the displayed number).
  const holdOrBetter = sigCounts['HOLD'] + sigCounts['BUY'] + sigCounts['BUY+']
  const buyOrBetter  = sigCounts['BUY'] + sigCounts['BUY+']
  const funnelTiers = [
    { label: 'TOTAL STOCKS',   count: total,              pctOfTotal: 100 },
    { label: 'HOLD OR BETTER', count: holdOrBetter,       pctOfTotal: pct(holdOrBetter, total) },
    { label: 'BUY OR BETTER',  count: buyOrBetter,        pctOfTotal: pct(buyOrBetter, total) },
    { label: 'BUY+ ONLY',      count: sigCounts['BUY+'],  pctOfTotal: pct(sigCounts['BUY+'], total) },
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

  const rawTrendData: YearRow[] = FUND_YEARS.map(y => {
    const a = aggMap.get(y)!
    return { year: y, revenue: a.rev || null, ebitda: a.ebitda || null, fcf: a.fcf || null, dividends: a.div || null }
  })

  const valuationTrendData: YearRow[] = FUND_YEARS.map(y => {
    const v = valMap.get(y)!
    return {
      year:     y,
      pe:       v.peN   > 0 ? v.peSum   / v.peN   : null,
      evEbitda: v.evN   > 0 ? v.evSum   / v.evN   : null,
      fcfYield: v.fcfYN > 0 ? v.fcfYSum / v.fcfYN : null,
      divYield: v.divYN > 0 ? v.divYSum / v.divYN : null,
    }
  })

  const rawTrendMetrics: MetricDef[] = [
    { key: 'revenue',   label: 'REVENUE',   color: GREEN,     kind: 'currency' },
    { key: 'ebitda',    label: 'EBITDA',    color: '#f59e0b', kind: 'currency' },
    { key: 'fcf',       label: 'FCF',       color: '#3b82f6', kind: 'currency' },
    { key: 'dividends', label: 'DIVIDENDS', color: '#d55181', kind: 'currency' },
  ]
  const valuationTrendMetrics: MetricDef[] = [
    { key: 'pe',       label: 'P/E RATIO',      color: GREEN,     kind: 'multiple' },
    { key: 'evEbitda', label: 'EV/EBITDA',      color: '#f59e0b', kind: 'multiple' },
    { key: 'fcfYield', label: 'FCF YIELD',      color: '#3b82f6', kind: 'pct' },
    { key: 'divYield', label: 'DIVIDEND YIELD', color: '#d55181', kind: 'pct' },
  ]

  // ── growth comparison (indexed, FY21=100) ───────────────────────────────────
  // Merges raw fundamentals + valuation into one dataset so both can be
  // rebased and overlaid on a single chart — see GrowthComparisonChart.
  const combinedYearData: YearRow[] = FUND_YEARS.map((y, i) => ({
    ...rawTrendData[i],
    ...valuationTrendData[i],
    year: y,
  }))
  const combinedMetrics: MetricDef[] = [
    { key: 'revenue',   label: 'REVENUE',        color: GREEN,     kind: 'currency' },
    { key: 'ebitda',    label: 'EBITDA',         color: '#f59e0b', kind: 'currency' },
    { key: 'fcf',       label: 'FCF',            color: '#3b82f6', kind: 'currency' },
    { key: 'dividends', label: 'DIVIDENDS',      color: '#d55181', kind: 'currency' },
    { key: 'pe',        label: 'P/E RATIO',      color: '#a78bfa', kind: 'multiple' },
    { key: 'evEbitda',  label: 'EV/EBITDA',      color: '#22d3ee', kind: 'multiple' },
    { key: 'fcfYield',  label: 'FCF YIELD',      color: '#facc15', kind: 'pct' },
    { key: 'divYield',  label: 'DIVIDEND YIELD', color: '#fb7185', kind: 'pct' },
  ]

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
  const firstEbitda = rawTrendData[0]?.ebitda ?? null
  const lastEbitda  = rawTrendData[rawTrendData.length - 1]?.ebitda ?? null
  const firstEv     = valuationTrendData.find(v => v.evEbitda != null)?.evEbitda ?? null
  const lastEv      = [...valuationTrendData].reverse().find(v => v.evEbitda != null)?.evEbitda ?? null
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
          padding: '2.5rem 0 1.5rem',
        }}>
          <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.25em', margin: '0 0 14px' }}>
            STOCKSNACK · {activeGroup.key === 'ALL' ? 'MARKET OVERVIEW' : `${activeGroup.label} MARKET OVERVIEW`}
          </p>
          {/* Verdict card: the one-word takeaway, up front and skimmable.
              Title tooltip carries the methodology so it's still discoverable
              without bloating the visible copy. */}
          <div
            title="Based on the share of stocks currently scoring BUY or better by StockSnack's model: >50% bullish = cheap, 30-50% = fairly valued, <30% = expensive."
            style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 10,
              border: `1px solid ${sentimentColor}66`, borderRadius: 6,
              padding: '8px 16px', marginBottom: '0.75rem',
              background: `${sentimentColor}1a`,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.18em', color: 'rgba(0,255,65,0.5)' }}>MARKET</span>
            <span style={{ fontSize: 20, fontWeight: 'bold', letterSpacing: '0.04em', color: sentimentColor }}>{sentiment}</span>
          </div>

          <p style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 1.25rem', color: 'rgba(0,255,65,0.75)' }}>
            <span style={{ color: GREEN, fontWeight: 'bold' }}>{bullishPct}%</span> of {activeGroup.noun} stocks are projected to beat the market right now.
          </p>

          {/* group filter */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {GROUPS.map(g => {
              const active = g.key === activeGroup.key
              return (
                <Link
                  key={g.key}
                  href={g.key === 'SP500' ? '/market' : `/market?group=${g.key}`}
                  style={{
                    ...FONT, fontSize: 10, fontWeight: 'bold', letterSpacing: '0.08em',
                    padding: '6px 14px', borderRadius: 4, textDecoration: 'none',
                    border: `1px solid ${active ? GREEN : 'rgba(0,255,65,0.2)'}`,
                    background: active ? GREEN : 'transparent',
                    color: active ? '#000' : 'rgba(0,255,65,0.5)',
                  }}
                >
                  {g.label}
                </Link>
              )
            })}
          </div>
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
              <SignalFunnel tiers={funnelTiers} />
            </div>
          </div>
        </div>

        {/* ── SECTION 2: RAW FUNDAMENTAL TRENDS ── */}
        <div style={S.section}>
          <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ background: '#001a00', borderBottom: '1px solid rgba(0,255,65,0.1)', padding: '1rem 1.25rem' }}>
              <p style={S.head}>02 — RAW FUNDAMENTAL TRENDS — SUM ACROSS UNIVERSE (FY21–FY25)</p>
              <p style={{ fontSize: 11, color: DIM, margin: '4px 0 0', letterSpacing: '0.08em' }}>
                What the businesses are actually doing, before the market prices it — click a metric to add/remove its chart
              </p>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <MetricChartPicker metrics={rawTrendMetrics} data={rawTrendData} defaultSelected={['revenue']} />
            </div>
          </div>
        </div>

        {/* ── SECTION 3: MARKET VALUATION ── */}
        <div style={S.section}>
          <p style={{ ...S.head, marginBottom: '0.75rem' }}>03 — MARKET VALUATION — {activeGroup.label} AVERAGE</p>
          <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ background: '#001a00', borderBottom: '1px solid rgba(0,255,65,0.1)', padding: '1rem 1.25rem' }}>
              <p style={{ ...S.head, fontSize: 10, letterSpacing: '0.08em', color: DIM }}>HOW WE GOT HERE — AVG MULTIPLE/YIELD BY YEAR — click a metric to add/remove its chart</p>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <MetricChartPicker metrics={valuationTrendMetrics} data={valuationTrendData} defaultSelected={['evEbitda']} />
            </div>
          </div>
        </div>

        {/* ── SECTION 4: GROWTH COMPARISON (INDEXED) ── */}
        <div style={S.section}>
          <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ background: '#001a00', borderBottom: '1px solid rgba(0,255,65,0.1)', padding: '1rem 1.25rem' }}>
              <p style={S.head}>04 — GROWTH COMPARISON — INDEXED TO FY21 = 100</p>
              <p style={{ fontSize: 11, color: DIM, margin: '4px 0 0', letterSpacing: '0.08em' }}>
                Pick any combination of fundamentals and valuation metrics to compare growth rates directly, regardless of original units
              </p>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <GrowthComparisonChart metrics={combinedMetrics} data={combinedYearData} defaultSelected={['revenue', 'ebitda']} />
            </div>
          </div>
        </div>

        {/* ── SECTION 5: MARKET SENTIMENT SUMMARY ── */}
        <div style={S.section}>
          <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ background: '#001a00', borderBottom: '1px solid rgba(0,255,65,0.1)', padding: '1rem 1.25rem' }}>
              <p style={S.head}>05 — MARKET SENTIMENT SUMMARY</p>
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

        {/* ── SECTION 6: SECTOR RANKINGS ── */}
        <div style={S.section}>
          <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ background: '#001a00', borderBottom: '1px solid rgba(0,255,65,0.1)', padding: '1rem 1.25rem' }}>
              <p style={S.head}>06 — SECTOR RANKINGS — SORTED BY AVG SCORE</p>
            </div>
            {/* No left padding here -- it left a gap between the container's
                edge and the sticky SECTOR column that the column's own
                background never covered, so scrolled-away content bled
                through that strip. The 20px inset is applied as SECTOR's
                own left padding instead, so its background actually covers
                it (box-sizing:border-box keeps the total column width
                unchanged, so STOCKS's sticky offset still lines up). */}
            <div style={{ padding: '0 1.25rem 0 0', overflowX: 'auto' }}>
              <table style={{ ...S.table, fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, position: 'sticky', left: 0, zIndex: 2, background: STICKY_TH_BG, width: STICKY_COL1_W, minWidth: STICKY_COL1_W, paddingLeft: 20 }}>SECTOR</th>
                    <th style={{ ...S.th, textAlign: 'right' as const, position: 'sticky', left: STICKY_COL1_W, zIndex: 2, background: STICKY_TH_BG, width: STICKY_COL2_W, minWidth: STICKY_COL2_W }}>STOCKS</th>
                    <th style={{ ...S.th, textAlign: 'right' as const }}>AVG SCORE</th>
                    <th style={{ ...S.th, textAlign: 'right' as const }} title="Forward-looking: the 5-year CAGR implied by StockSnack's price projection model, not a historical growth rate">CAGR (PROJ.)</th>
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
                        <td style={{ ...S.td, position: 'sticky', left: 0, zIndex: 1, background: STICKY_TD_BG, width: STICKY_COL1_W, minWidth: STICKY_COL1_W, paddingLeft: 20 }}>{r.sector}</td>
                        <td style={{ ...S.td, textAlign: 'right' as const, color: DIM, position: 'sticky', left: STICKY_COL1_W, zIndex: 1, background: STICKY_TD_BG, width: STICKY_COL2_W, minWidth: STICKY_COL2_W }}>{r.count}</td>
                        <td style={{ ...S.td, textAlign: 'right' as const, fontWeight: 'bold', color: scoreColor(r.avgScore) }}>
                          {r.avgScore.toFixed(1)}
                        </td>
                        <td style={{ ...S.td, textAlign: 'right' as const, color: DIM }}>
                          {fmtCagr(r.avgCagr)}
                        </td>
                        {SIGNALS.map(sig => (
                          <td key={sig} style={{ ...S.td, textAlign: 'right' as const, color: r.signals[sig] > 0 ? SIGNAL_COLOR[sig] : DIM }}>
                            {r.signals[sig] > 0 ? `${r.signals[sig]} (${pct(r.signals[sig], r.count)}%)` : '—'}
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
