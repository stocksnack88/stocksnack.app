export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import type { CSSProperties } from 'react'
import { getCachedUser } from '@/lib/server-auth'
import { supabaseAdmin } from '@/lib/supabase'
import RefreshButton from './RefreshButton'
import CopyReportButton from './CopyReportButton'

const ADMIN_EMAIL = 'stocksnack88@gmail.com'
const STALE_DAYS  = 14

// ── types ─────────────────────────────────────────────────────────────────────

type FundRow = {
  ticker: string
  fiscal_year: number
  eps: number | null
  rd_expense: number | null
  roe: number | null
  roic: number | null
  gross_margin: number | null
  net_margin: number | null
  operating_margin: number | null
  free_cash_flow: number | null
  total_debt: number | null
  total_equity: number | null
  sga: number | null
  sbc: number | null
  tax_rate: number | null
  capex: number | null
  shares_outstanding: number | null
  intangibles: number | null
  revenue: number | null
  total_assets: number | null
  updated_at: string | null
  // Section 6 fields
  ebitda: number | null
  net_income: number | null
  cash_and_equivalents: number | null
  current_liabilities: number | null
}

type FixLogRow = {
  id: number
  ticker: string
  issue: string
  fix_description: string | null
  run_id: number | null
  created_at: string
}

type ScoreRow = {
  ticker: string
  final_score: number | null
  has_anomaly: boolean | null
  updated_at: string | null
  product_segments: Array<{ name: string; pct: number }> | null
  geo_segments: Array<{ name: string; pct: number }> | null
  m1_ev_ebitda_multiple: number | null
  m1_ebitda_current: number | null
}

type PriceRow = {
  ticker: string
  market_cap: number | null
}

// ── helpers ───────────────────────────────────────────────────────────────────

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100)
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function fmtB(v: number | null): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(1)}T`
  if (abs >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`
  if (abs >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`
  return `$${v.toFixed(0)}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return iso.split('T')[0]
}

function daysSince(iso: string | null): number {
  if (!iso) return 9999
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function coverageColor(n: number): string {
  if (n >= 90) return '#00ff88'
  if (n >= 70) return '#ffcc00'
  return '#ef4444'
}

function coverageLabel(n: number): string {
  if (n >= 90) return 'GOOD'
  if (n >= 70) return 'WARN'
  return 'LOW'
}

// ── styles ────────────────────────────────────────────────────────────────────

const FONT: CSSProperties = { fontFamily: "'Courier New', Courier, monospace" }
const DIM  = 'rgba(0,255,136,0.35)'
const FAINT = 'rgba(0,255,136,0.12)'

const S = {
  page:    { background: '#000', color: '#00ff88', minHeight: '100vh', ...FONT, padding: '2rem' } as CSSProperties,
  wrap:    { maxWidth: 1140, margin: '0 auto' } as CSSProperties,
  section: { marginTop: '2.5rem' } as CSSProperties,
  head:    {
    fontSize: 10, fontWeight: 'bold', letterSpacing: '0.15em',
    color: DIM, marginBottom: '0.6rem',
    borderBottom: '1px solid rgba(0,255,136,0.12)', paddingBottom: '0.35rem',
  } as CSSProperties,
  table:   { width: '100%', borderCollapse: 'collapse' as const, fontSize: 11 },
  th:      { textAlign: 'left' as const, color: DIM, padding: '4px 12px 4px 0', fontWeight: 'normal', letterSpacing: '0.08em', fontSize: 9 },
  td:      { padding: '3px 12px 3px 0', borderBottom: '1px solid rgba(0,255,136,0.05)', verticalAlign: 'top' as const },
  none:    { fontSize: 11, color: DIM, padding: '6px 0' } as CSSProperties,
}

// ── page ──────────────────────────────────────────────────────────────────────

export default async function AdminHealthPage() {
  const user = await getCachedUser()
  if (!user || user.email !== ADMIN_EMAIL) redirect('/screener')

  const refreshedAt = new Date().toUTCString()

  // ── parallel fetch ──────────────────────────────────────────────────────────
  const [{ data: scoresRaw }, { data: fundRaw }, { data: priceRaw }, { data: fixLogRaw }] = await Promise.all([
    supabaseAdmin
      .from('stock_scores')
      .select('ticker, final_score, has_anomaly, updated_at, product_segments, geo_segments, m1_ev_ebitda_multiple, m1_ebitda_current'),
    supabaseAdmin
      .from('stock_fundamentals')
      .select('ticker, fiscal_year, eps, rd_expense, roe, roic, gross_margin, net_margin, operating_margin, free_cash_flow, total_debt, total_equity, sga, sbc, tax_rate, capex, shares_outstanding, intangibles, revenue, total_assets, updated_at, ebitda, net_income, cash_and_equivalents, current_liabilities')
      .order('fiscal_year', { ascending: false }),
    supabaseAdmin
      .from('stock_prices')
      .select('ticker, market_cap'),
    supabaseAdmin
      .from('fix_log')
      .select('id, ticker, issue, fix_description, run_id, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const scores  = (scoresRaw  ?? []) as ScoreRow[]
  const fundAll = (fundRaw   ?? []) as FundRow[]
  const prices  = (priceRaw  ?? []) as PriceRow[]
  const fixLog  = (fixLogRaw ?? []) as FixLogRow[]

  // most-recent fundamentals row per ticker (fundAll is ordered DESC already)
  const latestFund = new Map<string, FundRow>()
  const latestUpdated = new Map<string, string>()
  for (const row of fundAll) {
    if (!latestFund.has(row.ticker)) latestFund.set(row.ticker, row)
    const cur = latestUpdated.get(row.ticker)
    if (row.updated_at && (!cur || row.updated_at > cur)) {
      latestUpdated.set(row.ticker, row.updated_at)
    }
  }

  const priceMap = new Map(prices.map(p => [p.ticker, p.market_cap]))

  // ── 1. Summary ──────────────────────────────────────────────────────────────
  const totalTickers    = scores.length
  const withFinalScore  = scores.filter(s => s.final_score != null).length
  const anomalyFlagged  = scores.filter(s => s.has_anomaly).length
  const completePct     = pct(withFinalScore, totalTickers)

  // ── 2. Field coverage ───────────────────────────────────────────────────────
  const fundFields: Array<{ key: keyof FundRow; label: string }> = [
    { key: 'eps',               label: 'eps' },
    { key: 'rd_expense',        label: 'rd_expense' },
    { key: 'roe',               label: 'roe' },
    { key: 'roic',              label: 'roic' },
    { key: 'gross_margin',      label: 'gross_margin' },
    { key: 'net_margin',        label: 'net_margin' },
    { key: 'operating_margin',  label: 'operating_margin' },
    { key: 'free_cash_flow',    label: 'free_cash_flow' },
    { key: 'total_debt',        label: 'total_debt' },
    { key: 'total_equity',      label: 'total_equity' },
    { key: 'sga',               label: 'sga' },
    { key: 'sbc',               label: 'sbc' },
    { key: 'tax_rate',          label: 'tax_rate' },
    { key: 'capex',             label: 'capex' },
    { key: 'shares_outstanding', label: 'shares_outstanding' },
    { key: 'intangibles',       label: 'intangibles' },
  ]

  const latestFundValues = Array.from(latestFund.values())
  const fundTotal = latestFund.size
  const fundRows_coverage = fundFields.map(({ key, label }) => {
    const populated = latestFundValues.filter(r => r[key] != null).length
    return { label, source: 'fundamentals', populated, null_: fundTotal - populated, coverage: pct(populated, fundTotal) }
  })

  const scoresTotal = scores.length
  const scoresFields_coverage = [
    { label: 'product_segments', populated: scores.filter(s => Array.isArray(s.product_segments) && s.product_segments.length > 0).length },
    { label: 'geo_segments',     populated: scores.filter(s => Array.isArray(s.geo_segments) && s.geo_segments.length > 0).length },
    { label: 'm1_ev_ebitda_multiple', populated: scores.filter(s => s.m1_ev_ebitda_multiple != null).length },
  ].map(({ label, populated }) => ({
    label, source: 'stock_scores', populated, null_: scoresTotal - populated, coverage: pct(populated, scoresTotal),
  }))

  const allCoverage = [...fundRows_coverage, ...scoresFields_coverage]

  // ── 3. Quality flags ────────────────────────────────────────────────────────
  const longSegNames: Array<{ ticker: string; name: string; len: number }> = []
  for (const s of scores) {
    if (!Array.isArray(s.product_segments)) continue
    for (const seg of s.product_segments) {
      if (typeof seg.name === 'string' && seg.name.length > 40) {
        longSegNames.push({ ticker: s.ticker, name: seg.name, len: seg.name.length })
      }
    }
  }

  type FlagRow = { ticker: string; flags: string[] }
  const missingData: FlagRow[] = scores.flatMap(s => {
    const flags: string[] = []
    if (s.final_score == null) flags.push('final_score')
    if (s.m1_ev_ebitda_multiple == null) flags.push('m1_ev_ebitda_multiple')
    if (!Array.isArray(s.product_segments) || s.product_segments.length === 0) flags.push('product_segments')
    if (!Array.isArray(s.geo_segments) || s.geo_segments.length === 0) flags.push('geo_segments')
    return flags.length > 0 ? [{ ticker: s.ticker, flags }] : []
  }).sort((a, b) => a.ticker.localeCompare(b.ticker))

  // ── 4. Anomaly alerts ───────────────────────────────────────────────────────
  const revs     = latestFundValues.map(r => r.revenue).filter((v): v is number => v != null && v > 0)
  const assets   = latestFundValues.map(r => r.total_assets).filter((v): v is number => v != null && v > 0)
  const mktcaps  = prices.map(p => p.market_cap).filter((v): v is number => v != null && v > 0)

  const medRev    = median(revs)
  const medAssets = median(assets)
  const medMktcap = median(mktcaps)

  const anomalies = Array.from(latestFund.entries()).flatMap(([ticker, row]) => {
    const rev    = row.revenue
    const ast    = row.total_assets
    const mktcap = priceMap.get(ticker) ?? null
    const flags: string[] = []
    if (rev    != null && medRev    > 0 && rev    > medRev    * 10) flags.push('REVENUE')
    if (ast    != null && medAssets > 0 && ast    > medAssets * 10) flags.push('TOTAL ASSETS')
    if (mktcap != null && medMktcap > 0 && mktcap > medMktcap * 10) flags.push('MARKET CAP')
    return flags.length > 0 ? [{ ticker, rev, ast, mktcap, flags }] : []
  }).sort((a, b) => a.ticker.localeCompare(b.ticker))

  // ── 5. Staleness ────────────────────────────────────────────────────────────
  type StaleRow = { ticker: string; lastUpdated: string | null; days: number }
  const stalenessRows: StaleRow[] = scores.map(s => {
    const lastUpdated = latestUpdated.get(s.ticker) ?? null
    return { ticker: s.ticker, lastUpdated, days: daysSince(lastUpdated) }
  }).sort((a, b) => b.days - a.days)

  const staleCount = stalenessRows.filter(r => r.days > STALE_DAYS).length

  // ── 6. Systemic risk flags ──────────────────────────────────────────────────
  const scoreMap = new Map(scores.map(s => [s.ticker, s]))

  // 6a: EBITDA sanity — m1_ebitda_current > revenue * 5
  type EbitdaSanityRow = { ticker: string; m1_ebitda: number; revenue: number; ratio: number }
  const ebitdaSanity: EbitdaSanityRow[] = []
  for (const [ticker, fund] of Array.from(latestFund.entries())) {
    const score = scoreMap.get(ticker)
    const ebitda = score?.m1_ebitda_current
    const rev    = fund.revenue
    if (ebitda != null && rev != null && rev > 0 && Math.abs(ebitda) > rev * 5) {
      ebitdaSanity.push({ ticker, m1_ebitda: ebitda, revenue: rev, ratio: ebitda / rev })
    }
  }
  ebitdaSanity.sort((a, b) => Math.abs(b.ratio) - Math.abs(a.ratio))

  // 6b: EPS null but computable (net_income + shares_outstanding available)
  type EpsComputeRow = { ticker: string; net_income: number; shares: number }
  const epsComputable: EpsComputeRow[] = []
  for (const [ticker, fund] of Array.from(latestFund.entries())) {
    if (fund.eps == null && fund.net_income != null && fund.shares_outstanding != null && fund.shares_outstanding > 0) {
      epsComputable.push({ ticker, net_income: fund.net_income, shares: fund.shares_outstanding })
    }
  }
  epsComputable.sort((a, b) => a.ticker.localeCompare(b.ticker))

  // 6c: Balance sheet float flag — cash/revenue > 2x AND current_liabilities/cash > 1.5x
  type FloatFlagRow = { ticker: string; cash: number; revenue: number; currLiab: number; cashRev: number; liabCash: number }
  const floatFlags: FloatFlagRow[] = []
  for (const [ticker, fund] of Array.from(latestFund.entries())) {
    const cash     = fund.cash_and_equivalents
    const rev      = fund.revenue
    const currLiab = fund.current_liabilities
    if (cash != null && rev != null && currLiab != null && rev > 0 && cash > 0) {
      const cashRev  = cash / rev
      const liabCash = currLiab / cash
      if (cashRev > 2 && liabCash > 1.5) {
        floatFlags.push({ ticker, cash, revenue: rev, currLiab, cashRev, liabCash })
      }
    }
  }
  floatFlags.sort((a, b) => b.liabCash - a.liabCash)

  // 6d: Zero/null EBITDA but positive net income
  type EbitdaMissingRow = { ticker: string; ebitda: number | null; net_income: number }
  const ebitdaMissing: EbitdaMissingRow[] = []
  for (const [ticker, fund] of Array.from(latestFund.entries())) {
    const ebitda = fund.ebitda
    const ni     = fund.net_income
    if (ni != null && ni > 0 && (ebitda == null || ebitda === 0)) {
      ebitdaMissing.push({ ticker, ebitda, net_income: ni })
    }
  }
  ebitdaMissing.sort((a, b) => a.ticker.localeCompare(b.ticker))

  // ── report string ───────────────────────────────────────────────────────────
  const hr = '─'.repeat(60)
  const reportLines: string[] = [
    hr,
    'STOCKSNACK · PIPELINE HEALTH REPORT',
    refreshedAt,
    hr,
    '',
    '01 — SUMMARY',
    `  TOTAL TICKERS TRACKED   ${totalTickers}`,
    `  COMPLETE CORE DATA      ${completePct}% (${withFinalScore} with final_score)`,
    `  ANOMALY FLAGS ACTIVE    ${anomalyFlagged}`,
    '',
    `02 — FIELD COVERAGE  (${fundTotal} tickers in fundamentals · ${scoresTotal} in scores)`,
    `  ${'FIELD'.padEnd(25)} ${'SOURCE'.padEnd(16)} ${'POP'.padStart(5)} ${'NULL'.padStart(5)} ${'COV'.padStart(4)} STATUS`,
    ...allCoverage.map(row =>
      `  ${row.label.padEnd(25)} ${row.source.padEnd(16)} ${String(row.populated).padStart(5)} ${String(row.null_).padStart(5)} ${String(row.coverage).padStart(3)}% ${coverageLabel(row.coverage)}`
    ),
    '',
    `03 — QUALITY FLAGS`,
    `  PRODUCT SEGMENT NAMES > 40 CHARS (${longSegNames.length})`,
    ...(longSegNames.length === 0
      ? ['  ✓ None']
      : longSegNames.map(r => `  ${r.ticker.padEnd(6)} [${r.len}] ${r.name}`)
    ),
    '',
    `  MISSING CRITICAL FIELDS (${missingData.length} tickers)`,
    ...(missingData.length === 0
      ? ['  ✓ None']
      : missingData.map(r => `  ${r.ticker.padEnd(6)} ${r.flags.join(' · ')}`)
    ),
    '',
    `04 — ANOMALY ALERTS — VALUES > 10x MEDIAN (${anomalies.length} flagged)`,
    `  MEDIAN: REV ${fmtB(medRev)}  ASSETS ${fmtB(medAssets)}  MKTCAP ${fmtB(medMktcap)}`,
    ...(anomalies.length === 0
      ? ['  ✓ No outliers detected']
      : [
          `  ${'TICKER'.padEnd(6)} ${'REVENUE'.padStart(9)} ${'ASSETS'.padStart(9)} ${'MKTCAP'.padStart(9)} FLAGS`,
          ...anomalies.map(r =>
            `  ${r.ticker.padEnd(6)} ${fmtB(r.rev).padStart(9)} ${fmtB(r.ast).padStart(9)} ${fmtB(r.mktcap ?? null).padStart(9)} ${r.flags.join(' · ')}`
          ),
        ]
    ),
    '',
    `05 — PIPELINE HEALTH — LAST UPDATED PER TICKER`,
    `  ${staleCount} STALE (>${STALE_DAYS} days) · ${stalenessRows.length - staleCount} UP TO DATE`,
    `  ${'TICKER'.padEnd(6)} ${'LAST UPDATED'.padEnd(12)} ${'DAYS'.padStart(4)} STATUS`,
    ...stalenessRows.map(r => {
      const missing = r.days === 9999
      const status  = missing ? 'MISSING' : r.days > STALE_DAYS ? 'STALE' : 'OK'
      const days    = missing ? '—' : String(r.days)
      return `  ${r.ticker.padEnd(6)} ${fmtDate(r.lastUpdated).padEnd(12)} ${days.padStart(4)} ${status}`
    }),
    hr,
  ]
  const report = reportLines.join('\n')

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.wrap}>

        {/* ── header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.2em', margin: '0 0 4px' }}>STOCKSNACK · INTERNAL</p>
            <h1 style={{ fontSize: 20, fontWeight: 'bold', letterSpacing: '0.1em', margin: 0 }}>PIPELINE HEALTH</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingTop: 4 }}>
            <span style={{ fontSize: 9, color: DIM }}>{refreshedAt}</span>
            <CopyReportButton report={report} />
            <RefreshButton />
          </div>
        </div>

        {/* ── 1. Summary ── */}
        <div style={S.section}>
          <p style={S.head}>01 — SUMMARY</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            {([
              { label: 'TOTAL TICKERS TRACKED', value: totalTickers.toLocaleString(), sub: 'in stock_scores',           warn: false },
              { label: 'COMPLETE CORE DATA',     value: `${completePct}%`,            sub: `${withFinalScore.toLocaleString()} with final_score`, warn: false },
              { label: 'ANOMALY FLAGS ACTIVE',   value: anomalyFlagged.toLocaleString(), sub: 'has_anomaly = true',     warn: anomalyFlagged > 0 },
            ]).map(({ label, value, sub, warn }) => (
              <div key={label} style={{ border: `1px solid ${FAINT}`, borderRadius: 4, padding: '1rem 1.25rem' }}>
                <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.15em', margin: '0 0 8px' }}>{label}</p>
                <p style={{ fontSize: 26, fontWeight: 'bold', margin: 0, color: (warn as boolean | undefined) ? '#ffcc00' : '#00ff88' }}>{value}</p>
                <p style={{ fontSize: 9, color: DIM, marginTop: 6 }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── 2. Field coverage ── */}
        <div style={S.section}>
          <p style={S.head}>02 — FIELD COVERAGE  ·  {fundTotal} tickers in stock_fundamentals · {scoresTotal} in stock_scores</p>
          <table style={S.table}>
            <thead>
              <tr>
                {(['FIELD', 'SOURCE', 'POPULATED', 'NULL', 'COVERAGE', 'STATUS'] as const).map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allCoverage.map(row => (
                <tr key={row.label}>
                  <td style={S.td}>{row.label}</td>
                  <td style={{ ...S.td, color: DIM }}>{row.source}</td>
                  <td style={{ ...S.td, textAlign: 'right' as const }}>{row.populated.toLocaleString()}</td>
                  <td style={{ ...S.td, textAlign: 'right' as const, color: row.null_ > 0 ? '#ef4444' : DIM }}>
                    {row.null_.toLocaleString()}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right' as const }}>{row.coverage}%</td>
                  <td style={{ ...S.td, color: coverageColor(row.coverage), fontWeight: 'bold', letterSpacing: '0.1em' }}>
                    {coverageLabel(row.coverage)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── 3. Quality flags ── */}
        <div style={S.section}>
          <p style={S.head}>03 — QUALITY FLAGS</p>

          {/* 3a: long segment names */}
          <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.12em', margin: '0 0 6px' }}>
            PRODUCT SEGMENT NAMES &gt; 40 CHARS ({longSegNames.length})
          </p>
          {longSegNames.length === 0 ? (
            <p style={S.none}>✓ None</p>
          ) : (
            <table style={{ ...S.table, marginBottom: '1.5rem' }}>
              <thead>
                <tr>{(['TICKER', 'SEGMENT NAME', 'CHARS'] as const).map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {longSegNames.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' as const }}>{r.ticker}</td>
                    <td style={{ ...S.td, color: '#ef4444', maxWidth: 540, wordBreak: 'break-all' as const }}>{r.name}</td>
                    <td style={{ ...S.td, color: '#ef4444' }}>{r.len}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 3b: missing critical data */}
          <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.12em', margin: '1rem 0 6px' }}>
            MISSING CRITICAL FIELDS ({missingData.length} tickers)
          </p>
          {missingData.length === 0 ? (
            <p style={S.none}>✓ None</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>{(['TICKER', 'MISSING FIELDS'] as const).map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {missingData.map(r => (
                  <tr key={r.ticker}>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' as const }}>{r.ticker}</td>
                    <td style={{ ...S.td, color: '#ef4444' }}>{r.flags.join('  ·  ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── 4. Anomaly alerts ── */}
        <div style={S.section}>
          <p style={S.head}>04 — ANOMALY ALERTS — VALUES &gt; 10× MEDIAN  ({anomalies.length} flagged)</p>
          <p style={{ fontSize: 9, color: DIM, margin: '0 0 10px' }}>
            MEDIAN — REVENUE: {fmtB(medRev)}  ·  TOTAL ASSETS: {fmtB(medAssets)}  ·  MARKET CAP: {fmtB(medMktcap)}
          </p>
          {anomalies.length === 0 ? (
            <p style={S.none}>✓ No outliers detected</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>{(['TICKER', 'REVENUE', 'TOTAL ASSETS', 'MARKET CAP', 'FLAGS'] as const).map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {anomalies.map(r => (
                  <tr key={r.ticker}>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' as const }}>{r.ticker}</td>
                    <td style={S.td}>{fmtB(r.rev)}</td>
                    <td style={S.td}>{fmtB(r.ast)}</td>
                    <td style={S.td}>{fmtB(r.mktcap)}</td>
                    <td style={{ ...S.td, color: '#ffcc00', fontWeight: 'bold', letterSpacing: '0.08em' }}>
                      {r.flags.join('  ·  ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── 5. Pipeline staleness ── */}
        <div style={S.section}>
          <p style={S.head}>05 — PIPELINE HEALTH — LAST UPDATED PER TICKER (stock_fundamentals)</p>
          <p style={{ fontSize: 11, fontWeight: 'bold', color: staleCount > 0 ? '#ef4444' : '#00ff88', margin: '0 0 10px' }}>
            {staleCount} STALE (&gt;{STALE_DAYS} days)  ·  {stalenessRows.length - staleCount} UP TO DATE
          </p>
          <table style={S.table}>
            <thead>
              <tr>{(['TICKER', 'LAST UPDATED', 'DAYS AGO', 'STATUS'] as const).map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {stalenessRows.map(r => {
                const stale   = r.days > STALE_DAYS
                const missing = r.days === 9999
                const color   = missing ? '#ef4444' : stale ? '#ffcc00' : DIM
                return (
                  <tr key={r.ticker}>
                    <td style={{ ...S.td, color: stale ? '#fff' : DIM }}>{r.ticker}</td>
                    <td style={{ ...S.td, color }}>{fmtDate(r.lastUpdated)}</td>
                    <td style={{ ...S.td, color }}>{missing ? '—' : r.days}</td>
                    <td style={{ ...S.td, color, fontWeight: stale ? 'bold' : 'normal', letterSpacing: '0.1em' }}>
                      {missing ? 'MISSING' : stale ? 'STALE' : 'OK'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── 6. Systemic risk flags ── */}
        <div style={S.section}>
          <p style={S.head}>06 — SYSTEMIC RISK FLAGS</p>

          {/* 6a: EBITDA sanity */}
          <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.12em', margin: '0 0 6px' }}>
            EBITDA SANITY — m1_ebitda_current &gt; 5× REVENUE ({ebitdaSanity.length} flagged)
          </p>
          {ebitdaSanity.length === 0 ? (
            <p style={S.none}>✓ None</p>
          ) : (
            <table style={{ ...S.table, marginBottom: '1.5rem' }}>
              <thead>
                <tr>{(['TICKER','M1 EBITDA','REVENUE','RATIO'] as const).map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {ebitdaSanity.map(r => (
                  <tr key={r.ticker}>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' as const }}>{r.ticker}</td>
                    <td style={{ ...S.td, color: '#ef4444' }}>{fmtB(r.m1_ebitda)}</td>
                    <td style={S.td}>{fmtB(r.revenue)}</td>
                    <td style={{ ...S.td, color: '#ef4444', fontWeight: 'bold' }}>{r.ratio.toFixed(1)}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 6b: EPS null but computable */}
          <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.12em', margin: '1rem 0 6px' }}>
            EPS NULL BUT COMPUTABLE — net_income + shares available ({epsComputable.length} tickers)
          </p>
          {epsComputable.length === 0 ? (
            <p style={S.none}>✓ None</p>
          ) : (
            <table style={{ ...S.table, marginBottom: '1.5rem' }}>
              <thead>
                <tr>{(['TICKER','NET INCOME','SHARES OUT','IMPLIED EPS'] as const).map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {epsComputable.map(r => (
                  <tr key={r.ticker}>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' as const }}>{r.ticker}</td>
                    <td style={S.td}>{fmtB(r.net_income)}</td>
                    <td style={S.td}>{(r.shares / 1e6).toFixed(1)}M</td>
                    <td style={{ ...S.td, color: '#ffcc00' }}>${(r.net_income / r.shares).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 6c: Balance sheet float flag */}
          <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.12em', margin: '1rem 0 6px' }}>
            BALANCE SHEET FLOAT FLAG — cash/revenue &gt; 2× AND curr.liab/cash &gt; 1.5× ({floatFlags.length} tickers)
          </p>
          {floatFlags.length === 0 ? (
            <p style={S.none}>✓ None</p>
          ) : (
            <table style={{ ...S.table, marginBottom: '1.5rem' }}>
              <thead>
                <tr>{(['TICKER','CASH','REVENUE','CURR LIAB','CASH/REV','LIAB/CASH'] as const).map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {floatFlags.map(r => (
                  <tr key={r.ticker}>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' as const }}>{r.ticker}</td>
                    <td style={S.td}>{fmtB(r.cash)}</td>
                    <td style={S.td}>{fmtB(r.revenue)}</td>
                    <td style={S.td}>{fmtB(r.currLiab)}</td>
                    <td style={{ ...S.td, color: '#ffcc00' }}>{r.cashRev.toFixed(1)}×</td>
                    <td style={{ ...S.td, color: '#ef4444', fontWeight: 'bold' }}>{r.liabCash.toFixed(1)}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 6d: Zero/null EBITDA but positive NI */}
          <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.12em', margin: '1rem 0 6px' }}>
            EBITDA NULL/ZERO WITH POSITIVE NET INCOME — D&amp;A extraction likely failed ({ebitdaMissing.length} tickers)
          </p>
          {ebitdaMissing.length === 0 ? (
            <p style={S.none}>✓ None</p>
          ) : (
            <table style={{ ...S.table, marginBottom: '1.5rem' }}>
              <thead>
                <tr>{(['TICKER','EBITDA','NET INCOME'] as const).map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {ebitdaMissing.map(r => (
                  <tr key={r.ticker}>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' as const }}>{r.ticker}</td>
                    <td style={{ ...S.td, color: '#ef4444' }}>{r.ebitda == null ? 'NULL' : '0'}</td>
                    <td style={S.td}>{fmtB(r.net_income)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 6e: Fix log */}
          <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.12em', margin: '1rem 0 6px' }}>
            SINGLE-TICKER RUN LOG — LAST 20 ENTRIES
          </p>
          {fixLog.length === 0 ? (
            <p style={S.none}>No entries yet</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>{(['TICKER','ISSUE','FIX DESCRIPTION','RUN ID','DATE'] as const).map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {fixLog.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' as const }}>{r.ticker}</td>
                    <td style={{ ...S.td, color: '#ffcc00' }}>{r.issue}</td>
                    <td style={{ ...S.td, color: DIM, maxWidth: 320 }}>{r.fix_description ?? '—'}</td>
                    <td style={{ ...S.td, color: DIM }}>{r.run_id ?? '—'}</td>
                    <td style={{ ...S.td, color: DIM }}>{fmtDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: `1px solid ${FAINT}`, fontSize: 9, color: 'rgba(0,255,136,0.15)' }}>
          STOCKSNACK ADMIN · /admin/health · INTERNAL USE ONLY
        </div>
      </div>
    </div>
  )
}
