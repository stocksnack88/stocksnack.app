export type SignalKey = 'BUY+' | 'BUY' | 'HOLD' | 'SELL'
export type TrendMetric = 'revenue' | 'ebitda' | 'fcf'
export type ValuationMetricKey = 'pe' | 'fcfYield' | 'divYield'
export type ValuationVerdict = 'ATTRACTIVE' | 'FAIR' | 'STRETCHED'

export type SignalCounts = Record<SignalKey, number>

export type ValuationPoint = {
  label: string
  pe: number | null
  fcfYield: number | null
  divYield: number | null
  current?: boolean
}

export type ValuationMetricData = {
  key: ValuationMetricKey
  label: string
  current: number | null
  historicalAverage: number | null
  verdict: ValuationVerdict
}

export type TrendPoint = {
  year: number
  revenue: number | null
  ebitda: number | null
  fcf: number | null
}

export type SectorPulse = {
  sector: string
  count: number
  valuationDeviation: number
  signals: SignalCounts
  valuationHistory: ValuationPoint[]
  valuationMetrics: ValuationMetricData[]
  trends: TrendPoint[]
}

export type MarketPulseData = {
  totalStocks: number
  bullishPct: number
  sp500Cagr: number
  valuationVerdict: ValuationVerdict
  valuationHistory: ValuationPoint[]
  valuationMetrics: ValuationMetricData[]
  overallSignals: SignalCounts
  sectors: SectorPulse[]
  marketTrends: TrendPoint[]
}
