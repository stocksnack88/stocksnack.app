export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase'
import { getCachedUser } from '@/lib/server-auth'
import { isLaunchedStock } from '@/lib/constants'
import type { CSSProperties } from 'react'
import AggregateCharts, { type AggregateYear } from './AggregateCharts'
import SectorTrendChart, { type SectorYearData } from './SectorTrendChart'

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
  wrap:    { maxWidth: 896, margin: '0 auto', padding: '0 1.5rem 4rem' } as CSSProperties,
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
  gross_margin: number | null
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
      supabaseAdmin
        .from('stock_scores')
        .select('ticker, final_score, signal, ppm_cagr, pe_ratio, fcf_yield, div_yield, stocks(name, sector, index_tags)')
        .order('final_score', { ascending: false }),
      supabaseAdmin
        .from('stock_fundamentals')
        .select('ticker, fiscal_year, revenue, ebitda, free_cash_flow, gross_margin')
        .gte('fiscal_year', 2021)
        .lte('fiscal_year', 2025),
    ])
    // Backend can freely ingest S&P 400/600 ahead of launch — keep this "S&P 500
    // aggregate" page true to its label until index_tags says otherwise.
    const scores = ((scoresRaw ?? []) as unknown as ScoreRow[]).filter((r) => isLaunchedStock(indexTagsOf(r)))
    return {
      scores,
      fund:   (fundRaw   ?? []) as FundRow[],
    }
  },
  ['market-v2-data'],
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

  const sigBars = SIGNALS.map(sig => ({
    sig,
    count: sigCounts[sig],
    pct: pct(sigCounts[sig], total),
    color: SIGNAL_COLOR[sig],
  }))

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

  // ── aggregate fundamentals by year ─────────────────────────────────────────
  const aggMap = new Map<number, { rev: number; ebitda: number; fcf: number }>()
  for (const y of FUND_YEARS) aggMap.set(y, { rev: 0, ebitda: 0, fcf: 0 })

  const sectorYearMap = new Map<string, Map<number, {
    revSum: number; revN: number
    ebitdaSum: number; ebitdaN: number
    fcfSum: number; fcfN: number
    gmSum: number; gmN: number
  }>>()

  for (const row of fund) {
    const y      = row.fiscal_year
    const sector = sectorMap.get(row.ticker) ?? 'Other'

    // aggregate
    const agg = aggMap.get(y)
    if (agg) {
      if (row.revenue        != null) agg.rev    += row.revenue
      if (row.ebitda         != null) agg.ebitda += row.ebitda
      if (row.free_cash_flow != null) agg.fcf    += row.free_cash_flow
    }

    // sector breakdown
    if (!sectorYearMap.has(sector)) sectorYearMap.set(sector, new Map())
    const sm = sectorYearMap.get(sector)!
    if (!sm.has(y)) sm.set(y, { revSum: 0, revN: 0, ebitdaSum: 0, ebitdaN: 0, fcfSum: 0, fcfN: 0, gmSum: 0, gmN: 0 })
    const sd = sm.get(y)!
    if (row.revenue        != null) { sd.revSum   += row.revenue;        sd.revN++ }
    if (row.ebitda         != null) { sd.ebitdaSum += row.ebitda;        sd.ebitdaN++ }
    if (row.free_cash_flow != null) { sd.fcfSum   += row.free_cash_flow; sd.fcfN++ }
    if (row.gross_margin   != null) { sd.gmSum    += row.gross_margin;   sd.gmN++ }
  }

  const aggregateYears: AggregateYear[] = FUND_YEARS.map(y => {
    const a = aggMap.get(y)!
    return {
      year:    y,
      revenue: a.rev    || null,
      ebitda:  a.ebitda || null,
      fcf:     a.fcf    || null,
    }
  })

  const sectorYears: SectorYearData[] = []
  for (const [sector, yearMap] of Array.from(sectorYearMap.entries())) {
    for (const y of FUND_YEARS) {
      const d = yearMap.get(y)
      sectorYears.push({
        sector,
        year:           y,
        revenue:        d && d.revN   > 0 ? d.revSum   / d.revN   : null,
        ebitda:         d && d.ebitdaN > 0 ? d.ebitdaSum / d.ebitdaN : null,
        fcf:            d && d.fcfN   > 0 ? d.fcfSum   / d.fcfN   : null,
        avgGrossMargin: d && d.gmN    > 0 ? d.gmSum    / d.gmN    : null,
      })
    }
  }

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

        {/* ── SECTION 1: SIGNAL DISTRIBUTION ── */}
        <div style={S.section}>
          <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ background: '#001a00', borderBottom: '1px solid rgba(0,255,65,0.1)', padding: '1rem 1.25rem' }}>
              <p style={S.head}>01 — SIGNAL DISTRIBUTION</p>
              <p style={{ fontSize: 11, color: DIM, margin: 0, letterSpacing: '0.08em' }}>
                Where {total} stocks stand today
              </p>
            </div>
            <div style={{ padding: '1.25rem' }}>
              {/* stacked bar */}
              <div style={{
                display: 'flex', height: 36, borderRadius: 4, overflow: 'hidden',
                border: `1px solid ${FAINT}`, marginBottom: '1rem',
              }}>
                {sigBars.map(({ sig, pct: p, color }) =>
                  p > 0 && (
                    <div
                      key={sig}
                      title={`${sig}: ${sigCounts[sig]} stocks (${p}%)`}
                      style={{
                        width: `${p}%`, background: color, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 'bold', color: '#000',
                        letterSpacing: '0.1em', transition: 'width 0.3s',
                      }}
                    >
                      {p >= 8 ? sig : ''}
                    </div>
                  )
                )}
              </div>
              {/* legend */}
              <div style={{ display: 'flex', gap: '0 2rem', flexWrap: 'wrap' }}>
                {sigBars.map(({ sig, count, pct: p, color }) => (
                  <div key={sig} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
                    <span style={{ fontSize: 10, color: DIM, letterSpacing: '0.08em' }}>{sig}</span>
                    <span style={{ fontSize: 13, fontWeight: 'bold', color }}>{count}</span>
                    <span style={{ fontSize: 9, color: DIM }}>({p}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 2: MARKET VALUATION ── */}
        <div style={S.section}>
          <p style={{ ...S.head, marginBottom: '0.75rem' }}>02 — MARKET VALUATION — S&P 500 AVERAGE</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
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
        </div>

        {/* ── SECTION 3: SECTOR RANKINGS ── */}
        <div style={S.section}>
          <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ background: '#001a00', borderBottom: '1px solid rgba(0,255,65,0.1)', padding: '1rem 1.25rem' }}>
              <p style={S.head}>03 — SECTOR RANKINGS — SORTED BY AVG SCORE</p>
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

        {/* ── SECTION 4: MARKET HEALTH & GROWTH ── */}
        <div style={S.section}>
          <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', borderRadius: 4, overflow: 'hidden' }}>
            {/* 4A header */}
            <div style={{ background: '#001a00', borderBottom: '1px solid rgba(0,255,65,0.1)', padding: '1rem 1.25rem' }}>
              <p style={S.head}>04A — S&P 500 AGGREGATE TRENDS (SUM, FY21–FY25)</p>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <AggregateCharts data={aggregateYears} />
            </div>
          </div>

          {/* 4B card */}
          <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', borderRadius: 4, overflow: 'hidden', marginTop: '0.75rem' }}>
            <div style={{ background: '#001a00', borderBottom: '1px solid rgba(0,255,65,0.1)', padding: '1rem 1.25rem' }}>
              <p style={S.head}>04B — SECTOR TRENDS (AVG PER COMPANY, FY21–FY25)</p>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <SectorTrendChart sectorYears={sectorYears} />
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
