export const revalidate = 3600

import { unstable_cache } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase'
import type { CSSProperties } from 'react'

// ── constants ──────────────────────────────────────────────────────────────────

const SP500_CAGR = 0.10 // 10% — long-term S&P 500 projected CAGR benchmark
const GREEN      = '#00ff41'
const DIM        = 'rgba(0,255,65,0.4)'
const FAINT      = 'rgba(0,255,65,0.1)'
const FONT: CSSProperties = { fontFamily: "'Courier New', Courier, monospace" }

const SIGNALS = ['BUY+', 'BUY', 'HOLD', 'SELL'] as const
const SIGNAL_COLOR: Record<string, string> = {
  'BUY+': '#00ff41',
  'BUY':  '#22c55e',
  'HOLD': '#ffcc00',
  'SELL': '#ef4444',
}

// ── styles ─────────────────────────────────────────────────────────────────────

const S = {
  page:    { background: '#000', color: GREEN, minHeight: '100vh', ...FONT, padding: '2rem' } as CSSProperties,
  wrap:    { maxWidth: 1100, margin: '0 auto' } as CSSProperties,
  section: { marginTop: '2.5rem' } as CSSProperties,
  head: {
    fontSize: 10, fontWeight: 'bold', letterSpacing: '0.2em',
    color: DIM, marginBottom: '0.75rem',
    borderBottom: `1px solid ${FAINT}`, paddingBottom: '0.4rem',
  } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 11 },
  th:    { textAlign: 'left' as const, color: DIM, padding: '4px 12px 4px 0', fontWeight: 'normal', letterSpacing: '0.1em', fontSize: 9 },
  td:    { padding: '4px 12px 4px 0', borderBottom: `1px solid ${FAINT}`, verticalAlign: 'top' as const },
}

// ── types ──────────────────────────────────────────────────────────────────────

type StocksRef = { name: string | null; sector: string | null }

type RawRow = {
  ticker: string
  final_score: number | null
  signal: string | null
  ppm_cagr: number | null
  pe_ratio: number | null
  fcf_yield: number | null
  div_yield: number | null
  stocks: StocksRef | StocksRef[] | null
}

function stocksRef(row: RawRow): StocksRef | null {
  if (!row.stocks) return null
  return Array.isArray(row.stocks) ? (row.stocks[0] ?? null) : row.stocks
}

// ── data ──────────────────────────────────────────────────────────────────────

const getMarketData = unstable_cache(
  async (): Promise<RawRow[]> => {
    const { data } = await supabaseAdmin
      .from('stock_scores')
      .select('ticker, final_score, signal, ppm_cagr, pe_ratio, fcf_yield, div_yield, stocks(name, sector)')
      .order('final_score', { ascending: false })
    return (data ?? []) as unknown as RawRow[]
  },
  ['market-page-data'],
  { revalidate: 3600 },
)

// ── helpers ───────────────────────────────────────────────────────────────────

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100)
}

function arrAvg(vals: number[]): number | null {
  return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0) / vals.length
}

function fmtPE(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}x`
}

function fmtPct(v: number | null, decimals = 1): string {
  return v == null ? '—' : `${(v * 100).toFixed(decimals)}%`
}

function fmtCagr(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}

function valStatus(
  val: number | null,
  cheapThreshold: number,
  expThreshold: number,
  higherIsCheap: boolean,
): { label: string; color: string } {
  if (val == null) return { label: '—', color: DIM }
  const isCheap     = higherIsCheap ? val > cheapThreshold : val < cheapThreshold
  const isExpensive = higherIsCheap ? val < expThreshold   : val > expThreshold
  if (isCheap)     return { label: 'CHEAP',     color: GREEN }
  if (isExpensive) return { label: 'EXPENSIVE', color: '#ef4444' }
  return { label: 'FAIR', color: '#ffcc00' }
}

function scoreColor(score: number): string {
  if (score >= 70) return GREEN
  if (score >= 50) return '#ffcc00'
  return '#ef4444'
}

// ── sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color,
}: {
  label: string; value: string; sub: string; color?: string
}) {
  return (
    <div style={{ border: `1px solid ${FAINT}`, borderRadius: 4, padding: '1rem 1.25rem' }}>
      <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.15em', margin: '0 0 8px' }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 'bold', margin: 0, color: color ?? GREEN }}>{value}</p>
      <p style={{ fontSize: 9, color: DIM, marginTop: 6 }}>{sub}</p>
    </div>
  )
}

function ValRow({
  label, current, cheapLabel, expLabel, status,
}: {
  label: string; current: string; cheapLabel: string; expLabel: string
  status: { label: string; color: string }
}) {
  const cell: CSSProperties = { padding: '6px 12px 6px 0', borderBottom: `1px solid ${FAINT}` }
  return (
    <tr>
      <td style={cell}>{label}</td>
      <td style={{ ...cell, fontWeight: 'bold', fontSize: 14 }}>{current}</td>
      <td style={{ ...cell, fontSize: 10, color: GREEN }}>{cheapLabel}</td>
      <td style={{ ...cell, fontSize: 10, color: '#ef4444' }}>{expLabel}</td>
      <td style={{ ...cell, fontWeight: 'bold', letterSpacing: '0.12em', color: status.color }}>
        {status.label}
      </td>
    </tr>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default async function MarketPage() {
  const rows = await getMarketData()

  // ── 1. Market Pulse ─────────────────────────────────────────────────────────
  const total = rows.length
  const sigCounts: Record<string, number> = { 'BUY+': 0, 'BUY': 0, 'HOLD': 0, 'SELL': 0 }
  for (const r of rows) {
    if (r.signal && sigCounts[r.signal] !== undefined) sigCounts[r.signal]++
  }
  const beatingCount = rows.filter(r => r.ppm_cagr != null && r.ppm_cagr > SP500_CAGR).length
  const beatingPct   = pct(beatingCount, total)

  // ── 2. Signal Breakdown ──────────────────────────────────────────────────────
  const sigTotal = SIGNALS.reduce((s, k) => s + sigCounts[k], 0)
  const sigBars  = SIGNALS.map(sig => ({
    sig,
    count: sigCounts[sig],
    pct:   sigTotal > 0 ? Math.round((sigCounts[sig] / sigTotal) * 100) : 0,
    color: SIGNAL_COLOR[sig],
  }))

  // ── 3. Market Valuation ──────────────────────────────────────────────────────
  const peVals  = rows.map(r => r.pe_ratio).filter((v): v is number => v != null && v > 0 && v < 200)
  const fcfVals = rows.map(r => r.fcf_yield).filter((v): v is number => v != null && isFinite(v) && v > 0)
  const divVals = rows.map(r => r.div_yield).filter((v): v is number => v != null && isFinite(v) && v > 0)

  const avgPE  = arrAvg(peVals)
  const avgFCF = arrAvg(fcfVals)
  const avgDiv = arrAvg(divVals)

  // P/E: lower = cheaper  →  higherIsCheap = false
  const peStatus  = valStatus(avgPE,  19,    22,    false)
  // FCF yield: higher = cheaper  →  higherIsCheap = true
  const fcfStatus = valStatus(avgFCF, 0.035, 0.032, true)
  // Div yield: higher = cheaper  →  higherIsCheap = true
  const divStatus = valStatus(avgDiv, 0.018, 0.013, true)

  // ── 4. Sector Breakdown ──────────────────────────────────────────────────────
  type SectorStat = { count: number; scoreSum: number; signals: Record<string, number> }
  const sectorMap = new Map<string, SectorStat>()

  for (const r of rows) {
    const sector = stocksRef(r)?.sector ?? 'Other'
    if (!sectorMap.has(sector)) {
      sectorMap.set(sector, { count: 0, scoreSum: 0, signals: { 'BUY+': 0, 'BUY': 0, 'HOLD': 0, 'SELL': 0 } })
    }
    const s = sectorMap.get(sector)!
    s.count++
    if (r.final_score != null) s.scoreSum += r.final_score
    if (r.signal && s.signals[r.signal] !== undefined) s.signals[r.signal]++
  }

  const sectorRows = Array.from(sectorMap.entries())
    .map(([sector, s]) => ({
      sector,
      count: s.count,
      avgScore: s.count > 0 ? s.scoreSum / s.count : 0,
      signals: s.signals,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)

  // ── 5. Top 10 ────────────────────────────────────────────────────────────────
  const top10 = rows.slice(0, 10)

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.wrap}>

        {/* ── header ── */}
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.25em', margin: '0 0 4px' }}>STOCKSNACK · S&P 500</p>
          <h1 style={{ fontSize: 22, fontWeight: 'bold', letterSpacing: '0.12em', margin: '0 0 4px' }}>MARKET OVERVIEW</h1>
          <p style={{ fontSize: 9, color: DIM, margin: 0 }}>
            Buffett-style scoring across all 500 tracked stocks
          </p>
        </div>

        {/* ── 1. Market Pulse ── */}
        <div style={S.section}>
          <p style={S.head}>01 — MARKET PULSE</p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '0.75rem',
          }}>
            <StatCard label="S&P 500 TRACKED" value={String(total)} sub="stocks analyzed" />
            <StatCard
              label="BUY+"
              value={String(sigCounts['BUY+'])}
              sub={`${pct(sigCounts['BUY+'], total)}% of universe`}
              color={SIGNAL_COLOR['BUY+']}
            />
            <StatCard
              label="BUY"
              value={String(sigCounts['BUY'])}
              sub={`${pct(sigCounts['BUY'], total)}% of universe`}
              color={SIGNAL_COLOR['BUY']}
            />
            <StatCard
              label="HOLD"
              value={String(sigCounts['HOLD'])}
              sub={`${pct(sigCounts['HOLD'], total)}% of universe`}
              color={SIGNAL_COLOR['HOLD']}
            />
            <StatCard
              label="SELL"
              value={String(sigCounts['SELL'])}
              sub={`${pct(sigCounts['SELL'], total)}% of universe`}
              color={SIGNAL_COLOR['SELL']}
            />
            <StatCard
              label="BEATING S&P 500"
              value={`${beatingPct}%`}
              sub={`${beatingCount} stocks > ${(SP500_CAGR * 100).toFixed(0)}% CAGR`}
              color={beatingPct >= 50 ? GREEN : '#ffcc00'}
            />
          </div>
        </div>

        {/* ── 2. Signal Breakdown ── */}
        <div style={S.section}>
          <p style={S.head}>02 — SIGNAL BREAKDOWN</p>

          {/* stacked bar */}
          <div style={{
            display: 'flex', height: 32, borderRadius: 4,
            overflow: 'hidden', marginBottom: '0.85rem',
            border: `1px solid ${FAINT}`,
          }}>
            {sigBars.map(({ sig, pct: p, color }) =>
              p > 0 && (
                <div
                  key={sig}
                  title={`${sig}: ${p}%`}
                  style={{
                    width: `${p}%`, background: color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 'bold', color: '#000', letterSpacing: '0.1em',
                  }}
                >
                  {p >= 7 ? sig : ''}
                </div>
              )
            )}
          </div>

          {/* legend */}
          <div style={{ display: 'flex', gap: '1.75rem', flexWrap: 'wrap' }}>
            {sigBars.map(({ sig, count, pct: p, color }) => (
              <div key={sig} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 9, height: 9, background: color, borderRadius: 2 }} />
                <span style={{ fontSize: 10, color: DIM }}>{sig}</span>
                <span style={{ fontSize: 12, fontWeight: 'bold', color }}>{count}</span>
                <span style={{ fontSize: 9, color: DIM }}>({p}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 3. Market Valuation ── */}
        <div style={S.section}>
          <p style={S.head}>03 — MARKET VALUATION — S&P 500 AVERAGE</p>
          <table style={S.table}>
            <thead>
              <tr>
                {(['METRIC', 'CURRENT AVG', 'CHEAP', 'EXPENSIVE', 'STATUS'] as const).map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <ValRow
                label="P/E RATIO"
                current={fmtPE(avgPE)}
                cheapLabel="< 19x"
                expLabel="> 22x"
                status={peStatus}
              />
              <ValRow
                label="FCF YIELD"
                current={fmtPct(avgFCF)}
                cheapLabel="> 3.5%"
                expLabel="< 3.2%"
                status={fcfStatus}
              />
              <ValRow
                label="DIVIDEND YIELD"
                current={fmtPct(avgDiv)}
                cheapLabel="> 1.8%"
                expLabel="< 1.3%"
                status={divStatus}
              />
            </tbody>
          </table>
        </div>

        {/* ── 4. Sector Breakdown ── */}
        <div style={S.section}>
          <p style={S.head}>04 — SECTOR BREAKDOWN — SORTED BY AVG SCORE</p>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>SECTOR</th>
                <th style={{ ...S.th, textAlign: 'right' as const }}>STOCKS</th>
                <th style={{ ...S.th, textAlign: 'right' as const }}>AVG SCORE</th>
                {SIGNALS.map(s => (
                  <th key={s} style={{ ...S.th, textAlign: 'right' as const, color: SIGNAL_COLOR[s] }}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sectorRows.map(r => (
                <tr key={r.sector}>
                  <td style={S.td}>{r.sector}</td>
                  <td style={{ ...S.td, textAlign: 'right' as const, color: DIM }}>{r.count}</td>
                  <td style={{ ...S.td, textAlign: 'right' as const, fontWeight: 'bold', color: scoreColor(r.avgScore) }}>
                    {r.avgScore.toFixed(1)}
                  </td>
                  {SIGNALS.map(sig => (
                    <td key={sig} style={{ ...S.td, textAlign: 'right' as const, color: r.signals[sig] > 0 ? SIGNAL_COLOR[sig] : DIM }}>
                      {r.signals[sig] > 0 ? r.signals[sig] : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── 5. Top 10 Today ── */}
        <div style={S.section}>
          <p style={S.head}>05 — TOP 10 TODAY — HIGHEST RANKED STOCKS</p>
          <table style={S.table}>
            <thead>
              <tr>
                {(['#', 'TICKER', 'COMPANY', 'SIGNAL', 'CAGR'] as const).map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top10.map((r, i) => {
                const stocks = stocksRef(r)
                const sigColor = r.signal ? (SIGNAL_COLOR[r.signal] ?? DIM) : DIM
                return (
                  <tr key={r.ticker}>
                    <td style={{ ...S.td, color: DIM, width: 28 }}>{i + 1}</td>
                    <td style={{ ...S.td, fontWeight: 'bold' }}>{r.ticker}</td>
                    <td style={{ ...S.td, color: DIM, maxWidth: 240 }}>{stocks?.name ?? '—'}</td>
                    <td style={{ ...S.td, fontWeight: 'bold', letterSpacing: '0.08em', color: sigColor }}>
                      {r.signal ?? '—'}
                    </td>
                    <td style={{ ...S.td, fontWeight: 'bold', color: (r.ppm_cagr ?? 0) > SP500_CAGR ? GREEN : DIM }}>
                      {fmtCagr(r.ppm_cagr)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── footer ── */}
        <div style={{
          marginTop: '3rem', paddingTop: '1rem',
          borderTop: `1px solid ${FAINT}`,
          fontSize: 9, color: 'rgba(0,255,65,0.18)',
        }}>
          STOCKSNACK · MARKET OVERVIEW · DATA UPDATED WEEKLY · S&P 500 CAGR BENCHMARK {(SP500_CAGR * 100).toFixed(0)}%
        </div>

      </div>
    </div>
  )
}
