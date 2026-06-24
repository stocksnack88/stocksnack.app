export const dynamic = 'force-dynamic'

import { unstable_cache } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCachedUser } from '@/lib/server-auth'
import { supabaseAdmin } from '@/lib/supabase'
import MarketPulse from './MarketPulse'
import type {
  MarketPulseData,
  SectorPulse,
  SignalCounts,
  SignalKey,
  TrendPoint,
  ValuationMetricData,
  ValuationPoint,
  ValuationVerdict,
} from './market-types'

const INTERNAL_EMAILS = ['mrepsiloned@gmail.com', 'stocksnack88@gmail.com']
const FUND_YEARS = [2021, 2022, 2023, 2024, 2025]
const SIGNALS: SignalKey[] = ['BUY+', 'BUY', 'HOLD', 'SELL']

type ScoreRow = {
  ticker: string
  signal: string | null
  pe_ratio: number | null
  fcf_yield: number | null
  div_yield: number | null
  sp500_cagr: number | null
  stocks: { sector: string | null } | { sector: string | null }[] | null
}

type FundRow = {
  ticker: string
  fiscal_year: number
  revenue: number | null
  ebitda: number | null
  free_cash_flow: number | null
  net_income: number | null
  dividends_paid: number | null
  market_cap_at_year: number | null
}

type ValuationSnapshot = {
  pe: number | null
  fcfYield: number | null
  divYield: number | null
}

function emptySignals(): SignalCounts {
  return { 'BUY+': 0, BUY: 0, HOLD: 0, SELL: 0 }
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function sectorOf(row: ScoreRow): string {
  const relation = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks
  return relation?.sector ?? 'Other'
}

function validCurrentSnapshot(rows: ScoreRow[]): ValuationSnapshot {
  return {
    pe: mean(rows.map(row => row.pe_ratio).filter((value): value is number => value != null && value > 0 && value < 200)),
    fcfYield: mean(rows.map(row => row.fcf_yield).filter((value): value is number => value != null && value > 0 && value < 0.5)),
    divYield: mean(rows.map(row => row.div_yield).filter((value): value is number => value != null && value > 0 && value < 0.15)),
  }
}

function historicalSnapshot(rows: FundRow[]): ValuationSnapshot {
  const pe: number[] = []
  const fcfYield: number[] = []
  const divYield: number[] = []

  for (const row of rows) {
    const marketCap = Number(row.market_cap_at_year)
    if (!Number.isFinite(marketCap) || marketCap <= 0) continue

    const netIncome = Number(row.net_income)
    if (Number.isFinite(netIncome) && netIncome > 0) {
      const ratio = marketCap / netIncome
      if (ratio > 0 && ratio < 200) pe.push(ratio)
    }

    const fcf = Number(row.free_cash_flow)
    if (Number.isFinite(fcf) && fcf > 0) {
      const yieldValue = fcf / marketCap
      if (yieldValue < 0.5) fcfYield.push(yieldValue)
    }

    const dividends = Math.abs(Number(row.dividends_paid))
    if (Number.isFinite(dividends) && dividends > 0) {
      const yieldValue = dividends / marketCap
      if (yieldValue < 0.15) divYield.push(yieldValue)
    }
  }

  return { pe: mean(pe), fcfYield: mean(fcfYield), divYield: mean(divYield) }
}

function verdict(current: number | null, historical: number | null, higherIsAttractive: boolean): ValuationVerdict {
  if (current == null || historical == null || historical === 0) return 'FAIR'
  const relative = (current - historical) / Math.abs(historical)
  const attractiveness = higherIsAttractive ? relative : -relative
  if (attractiveness >= 0.1) return 'ATTRACTIVE'
  if (attractiveness <= -0.1) return 'STRETCHED'
  return 'FAIR'
}

function stretchDeviation(current: ValuationSnapshot, historical: ValuationSnapshot): number {
  const deviations: number[] = []
  if (current.pe != null && historical.pe != null && historical.pe !== 0) {
    deviations.push((current.pe - historical.pe) / Math.abs(historical.pe))
  }
  if (current.fcfYield != null && historical.fcfYield != null && historical.fcfYield !== 0) {
    deviations.push((historical.fcfYield - current.fcfYield) / Math.abs(historical.fcfYield))
  }
  if (current.divYield != null && historical.divYield != null && historical.divYield !== 0) {
    deviations.push((historical.divYield - current.divYield) / Math.abs(historical.divYield))
  }
  return clamp((mean(deviations) ?? 0) * 100, -50, 50)
}

function averagePerCompany(rows: FundRow[], year: number): TrendPoint {
  const yearRows = rows.filter(row => row.fiscal_year === year)
  const values = (key: 'revenue' | 'ebitda' | 'free_cash_flow') =>
    yearRows.map(row => row[key]).filter((value): value is number => value != null && Number.isFinite(Number(value))).map(Number)
  return {
    year,
    revenue: mean(values('revenue')),
    ebitda: mean(values('ebitda')),
    fcf: mean(values('free_cash_flow')),
  }
}

function marketTotals(rows: FundRow[], year: number): TrendPoint {
  const yearRows = rows.filter(row => row.fiscal_year === year)
  const sum = (key: 'revenue' | 'ebitda' | 'free_cash_flow') => {
    const values = yearRows.map(row => row[key]).filter((value): value is number => value != null && Number.isFinite(Number(value))).map(Number)
    return values.length ? values.reduce((total, value) => total + value, 0) : null
  }
  return { year, revenue: sum('revenue'), ebitda: sum('ebitda'), fcf: sum('free_cash_flow') }
}

const getMarketData = unstable_cache(
  async () => {
    const [scoresResult, ...fundResults] = await Promise.all([
      supabaseAdmin
        .from('stock_scores')
        .select('ticker, signal, pe_ratio, fcf_yield, div_yield, sp500_cagr, stocks(sector)'),
      ...FUND_YEARS.map(year =>
        supabaseAdmin
          .from('stock_fundamentals')
          .select('ticker, fiscal_year, revenue, ebitda, free_cash_flow, net_income, dividends_paid, market_cap_at_year')
          .eq('fiscal_year', year),
      ),
    ])

    if (scoresResult.error) throw new Error(`Market scores query failed: ${scoresResult.error.message}`)
    for (const result of fundResults) {
      if (result.error) throw new Error(`Market fundamentals query failed: ${result.error.message}`)
    }

    return {
      scores: (scoresResult.data ?? []) as unknown as ScoreRow[],
      fund: fundResults.flatMap(result => (result.data ?? []) as FundRow[]),
    }
  },
  ['market-pulse-v1'],
  { revalidate: 3600 },
)

function buildMarketPulse(scores: ScoreRow[], fund: FundRow[]): MarketPulseData {
  const sectorByTicker = new Map(scores.map(row => [row.ticker, sectorOf(row)]))
  const scoresBySector = new Map<string, ScoreRow[]>()
  const fundBySector = new Map<string, FundRow[]>()

  for (const row of scores) {
    const sector = sectorOf(row)
    scoresBySector.set(sector, [...(scoresBySector.get(sector) ?? []), row])
  }
  for (const row of fund) {
    const sector = sectorByTicker.get(row.ticker) ?? 'Other'
    fundBySector.set(sector, [...(fundBySector.get(sector) ?? []), row])
  }

  const overallSignals = emptySignals()
  for (const row of scores) {
    if (SIGNALS.includes(row.signal as SignalKey)) overallSignals[row.signal as SignalKey]++
  }
  const bullishPct = scores.length
    ? ((overallSignals['BUY+'] + overallSignals.BUY) / scores.length) * 100
    : 0

  const current = validCurrentSnapshot(scores)
  const historyByYear = FUND_YEARS.map(year => historicalSnapshot(fund.filter(row => row.fiscal_year === year)))
  const historical = historicalSnapshot(fund)
  const valuationHistory: ValuationPoint[] = FUND_YEARS.map((year, index) => ({
    label: `FY${String(year).slice(2)}`,
    ...historyByYear[index],
  }))
  valuationHistory.push({ label: 'NOW', ...current, current: true })

  const valuationMetrics: ValuationMetricData[] = [
    { key: 'pe', label: 'P/E RATIO', current: current.pe, historicalAverage: historical.pe, verdict: verdict(current.pe, historical.pe, false) },
    { key: 'fcfYield', label: 'FCF YIELD', current: current.fcfYield, historicalAverage: historical.fcfYield, verdict: verdict(current.fcfYield, historical.fcfYield, true) },
    { key: 'divYield', label: 'DIVIDEND YIELD', current: current.divYield, historicalAverage: historical.divYield, verdict: verdict(current.divYield, historical.divYield, true) },
  ]
  const verdictCounts = valuationMetrics.reduce<Record<ValuationVerdict, number>>(
    (counts, metric) => ({ ...counts, [metric.verdict]: counts[metric.verdict] + 1 }),
    { ATTRACTIVE: 0, FAIR: 0, STRETCHED: 0 },
  )
  const valuationVerdict: ValuationVerdict = verdictCounts.ATTRACTIVE >= 2
    ? 'ATTRACTIVE'
    : verdictCounts.STRETCHED >= 2
      ? 'STRETCHED'
      : 'FAIR'

  const sectors: SectorPulse[] = Array.from(scoresBySector.entries()).map(([sector, sectorScores]): SectorPulse => {
    const sectorFund = fundBySector.get(sector) ?? []
    const sectorCurrent = validCurrentSnapshot(sectorScores)
    const sectorHistoryByYear = FUND_YEARS.map(year => historicalSnapshot(sectorFund.filter(row => row.fiscal_year === year)))
    const sectorHistorical = historicalSnapshot(sectorFund)
    const signals = emptySignals()
    for (const row of sectorScores) {
      if (SIGNALS.includes(row.signal as SignalKey)) signals[row.signal as SignalKey]++
    }
    return {
      sector,
      count: sectorScores.length,
      valuationDeviation: stretchDeviation(sectorCurrent, sectorHistorical),
      signals,
      valuationHistory: [
        ...FUND_YEARS.map((year, index) => ({
          label: `FY${String(year).slice(2)}`,
          ...sectorHistoryByYear[index],
        })),
        { label: 'NOW', ...sectorCurrent, current: true },
      ],
      valuationMetrics: [
        { key: 'pe', label: 'P/E RATIO', current: sectorCurrent.pe, historicalAverage: sectorHistorical.pe, verdict: verdict(sectorCurrent.pe, sectorHistorical.pe, false) },
        { key: 'fcfYield', label: 'FCF YIELD', current: sectorCurrent.fcfYield, historicalAverage: sectorHistorical.fcfYield, verdict: verdict(sectorCurrent.fcfYield, sectorHistorical.fcfYield, true) },
        { key: 'divYield', label: 'DIVIDEND YIELD', current: sectorCurrent.divYield, historicalAverage: sectorHistorical.divYield, verdict: verdict(sectorCurrent.divYield, sectorHistorical.divYield, true) },
      ],
      trends: FUND_YEARS.map(year => averagePerCompany(sectorFund, year)),
    }
  }).sort((a, b) => a.valuationDeviation - b.valuationDeviation)

  const sp500Cagr = mean(scores.map(row => row.sp500_cagr).filter((value): value is number => value != null && value > 0)) ?? 0.10

  return {
    totalStocks: scores.length,
    bullishPct,
    sp500Cagr,
    valuationVerdict,
    valuationHistory,
    valuationMetrics,
    overallSignals,
    sectors,
    marketTrends: FUND_YEARS.map(year => marketTotals(fund, year)),
  }
}

export default async function MarketPage() {
  const user = await getCachedUser()
  if (!user || !INTERNAL_EMAILS.includes(user.email ?? '')) redirect('/screener')

  const { scores, fund } = await getMarketData()
  return <MarketPulse data={buildMarketPulse(scores, fund)} />
}
