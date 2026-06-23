'use client'

import { useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  MarketPulseData,
  SectorPulse,
  SignalCounts,
  SignalKey,
  TrendMetric,
  TrendPoint,
  ValuationMetricData,
  ValuationMetricKey,
  ValuationPoint,
  ValuationVerdict,
} from './market-types'

const GREEN = '#00ff41'
const AMBER = '#f59e0b'
const RED = '#ef4444'
const DIM = 'rgba(0,255,65,0.42)'
const SIGNALS: SignalKey[] = ['BUY+', 'BUY', 'HOLD', 'SELL']
const SIGNAL_COLORS: Record<SignalKey, string> = {
  'BUY+': GREEN,
  BUY: '#22c55e',
  HOLD: AMBER,
  SELL: RED,
}
const METRICS: Array<{ key: TrendMetric; label: string }> = [
  { key: 'revenue', label: 'REVENUE' },
  { key: 'ebitda', label: 'EBITDA' },
  { key: 'fcf', label: 'FREE CASH FLOW' },
]
const VALUATION_METRICS: Array<{ key: ValuationMetricKey; label: string }> = [
  { key: 'pe', label: 'P/E' },
  { key: 'fcfYield', label: 'FCF YIELD' },
  { key: 'divYield', label: 'DIVIDEND' },
]

function verdictColor(verdict: ValuationVerdict): string {
  return verdict === 'ATTRACTIVE' ? GREEN : verdict === 'STRETCHED' ? RED : AMBER
}

function formatPercent(value: number | null, decimals = 1): string {
  return value == null ? '—' : `${(value * 100).toFixed(decimals)}%`
}

function formatMultiple(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)}x`
}

function formatMoney(value: number | null): string {
  if (value == null) return '—'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`
  return `${sign}$${abs.toFixed(0)}`
}

function totalSignals(signals: SignalCounts): number {
  return SIGNALS.reduce((total, signal) => total + signals[signal], 0)
}

function bullishPct(signals: SignalCounts): number {
  const total = totalSignals(signals)
  return total ? ((signals['BUY+'] + signals.BUY) / total) * 100 : 0
}

function metricCagr(points: TrendPoint[], metric: TrendMetric): number | null {
  const valid = points.filter(point => point[metric] != null)
  if (valid.length < 2) return null
  const first = valid[0]
  const last = valid[valid.length - 1]
  const firstValue = Number(first[metric])
  const lastValue = Number(last[metric])
  const years = last.year - first.year
  if (firstValue <= 0 || lastValue <= 0 || years <= 0) return null
  return Math.pow(lastValue / firstValue, 1 / years) - 1
}

function growthVerdict(cagr: number | null, sp500Cagr: number): { label: string; color: string } {
  if (cagr == null || cagr < 0) return { label: 'WEAKENING', color: RED }
  if (cagr >= sp500Cagr * 1.2) return { label: 'ACCELERATING', color: GREEN }
  if (cagr >= sp500Cagr) return { label: 'OUTPACING S&P', color: '#a3e635' }
  return { label: 'STABLE', color: AMBER }
}

function chartPoints(points: TrendPoint[], metric: TrendMetric, sp500Cagr: number) {
  const cagr = metricCagr(points, metric)
  const firstPositive = points.find(point => Number(point[metric]) > 0)
  const baseYear = firstPositive?.year
  const baseValue = firstPositive ? Number(firstPositive[metric]) : null
  return points.map(point => {
    const years = baseYear == null ? 0 : point.year - baseYear
    return {
      year: point.year,
      actual: point[metric],
      trend: baseValue != null && cagr != null && years >= 0 ? baseValue * Math.pow(1 + cagr, years) : null,
      benchmark: baseValue != null && years >= 0 ? baseValue * Math.pow(1 + sp500Cagr, years) : null,
    }
  })
}

function SectionHeader({ number, question, note }: { number: string; question: string; note: string }) {
  return (
    <div className="border-b border-[#00ff41]/10 bg-[#001a00] px-5 py-4">
      <p className="text-[10px] font-bold tracking-[0.2em] text-[#00ff41]/35">{number}</p>
      <h2 className="mt-1 text-sm font-bold tracking-[0.08em] text-[#00ff41]">{question}</h2>
      <p className="mt-1 text-[10px] leading-relaxed text-[#00ff41]/45">{note}</p>
    </div>
  )
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex rounded border px-2.5 py-1 text-[9px] font-bold tracking-[0.16em]" style={{ color, borderColor: `${color}88`, background: `${color}18` }}>
      {label}
    </span>
  )
}

function ValuationTooltip({ active, payload, label, metric }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
  metric: ValuationMetricData
}) {
  if (!active || !payload?.length) return null
  const value = payload[0]?.value ?? null
  return (
    <div className="border border-[#00ff41]/25 bg-black px-3 py-2 font-mono text-[10px] shadow-xl">
      <p className="text-[#00ff41]/40">{label}</p>
      <p className="mt-1 font-bold text-[#00ff41]">{metric.key === 'pe' ? formatMultiple(value) : formatPercent(value)}</p>
    </div>
  )
}

function ValuationHistoryCard({ metric, history }: { metric: ValuationMetricData; history: ValuationPoint[] }) {
  const color = verdictColor(metric.verdict)
  const chartData = history.map(point => ({ label: point.label, value: point[metric.key], current: point.current }))
  const [tooltipActive, setTooltipActive] = useState(false)
  return (
    <div className="overflow-hidden rounded border border-[#00ff41]/20 bg-[#00ff41]/[0.015]">
      <div className="flex items-start justify-between gap-3 border-b border-[#00ff41]/10 px-4 py-3">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-[#00ff41]">{metric.label}</p>
          <p className="mt-1 text-2xl font-bold" style={{ color }}>{metric.key === 'pe' ? formatMultiple(metric.current) : formatPercent(metric.current)}</p>
        </div>
        <StatusPill label={metric.verdict} color={color} />
      </div>
      <div className="px-2 pb-3 pt-4" onMouseLeave={() => setTooltipActive(false)} onMouseOut={() => setTooltipActive(false)} onMouseUp={() => setTooltipActive(false)} onPointerLeave={() => setTooltipActive(false)} onPointerUp={() => setTooltipActive(false)} onTouchEnd={() => setTooltipActive(false)}>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} onMouseMove={() => setTooltipActive(true)} onMouseLeave={() => setTooltipActive(false)} onTouchStart={() => setTooltipActive(true)} onTouchEnd={() => setTooltipActive(false)}>
            <CartesianGrid stroke="rgba(0,255,65,0.06)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: DIM, fontSize: 8 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: DIM, fontSize: 8 }} axisLine={false} tickLine={false} tickFormatter={value => metric.key === 'pe' ? `${Number(value).toFixed(0)}x` : `${(Number(value) * 100).toFixed(1)}%`} />
            <Tooltip active={tooltipActive} content={<ValuationTooltip metric={metric} />} cursor={{ fill: 'rgba(0,255,65,0.03)' }} />
            {metric.historicalAverage != null && (
              <ReferenceLine y={metric.historicalAverage} stroke="rgba(255,255,255,0.45)" strokeDasharray="4 4" label={{ value: '5Y AVG', fill: 'rgba(255,255,255,0.45)', fontSize: 8, position: 'insideTopRight' }} />
            )}
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {chartData.map(point => <Cell key={point.label} fill={point.current ? color : 'rgba(0,255,65,0.42)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="px-2 text-[9px] text-[#00ff41]/30">5Y AVG: {metric.key === 'pe' ? formatMultiple(metric.historicalAverage) : formatPercent(metric.historicalAverage)}</p>
      </div>
    </div>
  )
}

function SignalBar({ signals, showCounts = false }: { signals: SignalCounts; showCounts?: boolean }) {
  const total = totalSignals(signals)
  return (
    <div>
      <div className="flex h-7 overflow-hidden rounded border border-[#00ff41]/10 bg-[#00ff41]/5">
        {SIGNALS.map(signal => {
          const share = total ? (signals[signal] / total) * 100 : 0
          if (share === 0) return null
          return (
            <div key={signal} style={{ width: `${share}%`, background: SIGNAL_COLORS[signal] }} title={`${signal}: ${signals[signal]} (${share.toFixed(1)}%)`} />
          )
        })}
      </div>
      {showCounts && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {SIGNALS.map(signal => (
            <div key={signal} className="flex items-center gap-2 text-[9px]">
              <span className="h-2 w-2 rounded-sm" style={{ background: SIGNAL_COLORS[signal] }} />
              <span className="text-[#00ff41]/40">{signal}</span>
              <span className="font-bold" style={{ color: SIGNAL_COLORS[signal] }}>{signals[signal]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string }>; label?: number }) {
  if (!active || !payload?.length) return null
  return (
    <div className="border border-[#00ff41]/25 bg-black px-3 py-2 font-mono text-[9px] shadow-xl">
      <p className="text-[#00ff41]/40">FY{label}</p>
      {payload.map(item => <p key={item.dataKey} className="mt-1" style={{ color: item.color }}>{item.dataKey.toUpperCase()}: {formatMoney(item.value)}</p>)}
    </div>
  )
}

function GrowthChart({ title, points, metric, sp500Cagr, subtitle }: {
  title: string
  points: TrendPoint[]
  metric: TrendMetric
  sp500Cagr: number
  subtitle: string
}) {
  const cagr = metricCagr(points, metric)
  const verdict = growthVerdict(cagr, sp500Cagr)
  const data = chartPoints(points, metric, sp500Cagr)
  const [tooltipActive, setTooltipActive] = useState(false)
  return (
    <div className="overflow-hidden rounded border border-[#00ff41]/20 bg-[#00ff41]/[0.015]">
      <div className="flex items-start justify-between gap-3 border-b border-[#00ff41]/10 px-4 py-3">
        <div>
          <p className="text-[9px] font-bold tracking-[0.16em] text-[#00ff41]/45">{title}</p>
          <p className="mt-1 text-[9px] text-[#00ff41]/25">{subtitle}</p>
        </div>
        <StatusPill label={verdict.label} color={verdict.color} />
      </div>
      <div className="px-2 pb-3 pt-3" onMouseLeave={() => setTooltipActive(false)} onMouseOut={() => setTooltipActive(false)} onMouseUp={() => setTooltipActive(false)} onPointerLeave={() => setTooltipActive(false)} onPointerUp={() => setTooltipActive(false)} onTouchEnd={() => setTooltipActive(false)}>
        <div className="flex gap-2 px-2 pb-1 text-[8px]">
          <span className="rounded border border-[#00ff41]/40 bg-[#00ff41]/10 px-1.5 py-0.5 text-[#00ff41]">GROWTH {cagr == null ? 'N/M' : `${cagr >= 0 ? '+' : ''}${(cagr * 100).toFixed(1)}%`}</span>
          <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-red-400">S&P +{(sp500Cagr * 100).toFixed(1)}%</span>
        </div>
        <ResponsiveContainer width="100%" height={210}>
          <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} onMouseMove={() => setTooltipActive(true)} onMouseLeave={() => setTooltipActive(false)} onTouchStart={() => setTooltipActive(true)} onTouchEnd={() => setTooltipActive(false)}>
            <CartesianGrid stroke="rgba(0,255,65,0.06)" vertical={false} />
            <XAxis dataKey="year" tick={{ fill: DIM, fontSize: 8 }} axisLine={false} tickLine={false} tickFormatter={year => `FY${String(year).slice(2)}`} />
            <YAxis width={54} tick={{ fill: DIM, fontSize: 8 }} axisLine={false} tickLine={false} tickFormatter={value => formatMoney(Number(value))} />
            <Tooltip active={tooltipActive} content={<TrendTooltip />} cursor={{ fill: 'rgba(0,255,65,0.03)' }} />
            <Bar dataKey="actual" radius={[3, 3, 0, 0]}>
              {data.map(point => <Cell key={point.year} fill={Number(point.actual) < 0 ? 'rgba(239,68,68,0.55)' : 'rgba(0,255,65,0.45)'} />)}
            </Bar>
            <Line type="monotone" dataKey="trend" stroke={GREEN} strokeWidth={2} dot={{ fill: GREEN, r: 2, strokeWidth: 0 }} connectNulls />
            <Line type="monotone" dataKey="benchmark" stroke={RED} strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function SectorDeviationPanel({ sectors, selected, onSelect }: { sectors: SectorPulse[]; selected: string; onSelect: (sector: string) => void }) {
  const maxDeviation = Math.max(10, ...sectors.map(sector => Math.abs(sector.valuationDeviation)))
  return (
    <div className="space-y-1.5">
      <p className="mb-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[9px] font-bold tracking-[0.12em] text-amber-400 lg:hidden">TAP A SECTOR TO VIEW ITS VALUATION ↓</p>
      <p className="pb-1 text-[9px] font-bold tracking-[0.12em] text-[#00ff41]/75">BLENDED VALUATION DEVIATION <span className="text-[#00ff41]/40">· P/E · FCF YIELD · DIVIDEND YIELD</span></p>
      <div className="mb-2 grid grid-cols-[120px_1fr_48px] gap-2 text-[8px] font-bold tracking-wider text-[#00ff41]/70 sm:grid-cols-[180px_1fr_58px]">
        <span>SECTOR</span><span className="flex justify-between"><span>ATTRACTIVE</span><span>STRETCHED</span></span><span className="text-right leading-tight">VS 5Y</span>
      </div>
      {sectors.map(sector => {
        const deviation = sector.valuationDeviation
        const width = Math.min(50, (Math.abs(deviation) / maxDeviation) * 50)
        const active = sector.sector === selected
        return (
          <button key={sector.sector} type="button" aria-pressed={active} onClick={() => onSelect(sector.sector)} className={`grid w-full grid-cols-[120px_1fr_48px] items-center gap-2 rounded px-1 py-2 text-left transition-colors sm:grid-cols-[180px_1fr_58px] ${active ? 'bg-[#00ff41]/10' : 'hover:bg-[#00ff41]/5'}`}>
            <span className={`truncate text-[9px] sm:text-[10px] ${active ? 'font-bold text-[#00ff41]' : 'text-[#00ff41]/55'}`}>{sector.sector}{active ? ' →' : ''}</span>
            <span className="relative h-3 rounded-sm bg-[#00ff41]/5">
              <span className="absolute bottom-[-3px] left-1/2 top-[-3px] w-px bg-white/25" />
              <span
                className="absolute top-0 h-3 rounded-sm"
                style={deviation < 0
                  ? { right: '50%', width: `${width}%`, background: GREEN, opacity: 0.65 }
                  : { left: '50%', width: `${width}%`, background: RED, opacity: 0.65 }}
              />
            </span>
            <span className="text-right text-[9px] font-bold" style={{ color: deviation < 0 ? GREEN : deviation > 0 ? RED : AMBER }}>{deviation >= 0 ? '+' : ''}{deviation.toFixed(0)}%</span>
          </button>
        )
      })}
    </div>
  )
}

function MetricTabs({ value, onChange }: { value: TrendMetric; onChange: (metric: TrendMetric) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {METRICS.map(metric => (
        <button key={metric.key} onClick={() => onChange(metric.key)} className={`rounded border px-3 py-2 text-[9px] font-bold tracking-wider ${value === metric.key ? 'border-[#00ff41]/60 bg-[#00ff41]/10 text-[#00ff41]' : 'border-[#00ff41]/15 text-[#00ff41]/35'}`}>
          {metric.label}
        </button>
      ))}
    </div>
  )
}

function ValuationMetricTabs({ value, onChange }: { value: ValuationMetricKey; onChange: (metric: ValuationMetricKey) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {VALUATION_METRICS.map(metric => (
        <button key={metric.key} type="button" onClick={() => onChange(metric.key)} className={`rounded border px-3 py-2 text-[9px] font-bold tracking-wider ${value === metric.key ? 'border-[#00ff41]/60 bg-[#00ff41]/10 text-[#00ff41]' : 'border-[#00ff41]/15 text-[#00ff41]/35'}`}>
          {metric.label}
        </button>
      ))}
    </div>
  )
}

function SectorGrowthPanel({ sectors, metric, sp500Cagr, selected, onSelect }: {
  sectors: SectorPulse[]
  metric: TrendMetric
  sp500Cagr: number
  selected: string
  onSelect: (sector: string) => void
}) {
  const rows = sectors
    .map(sector => ({ ...sector, cagr: metricCagr(sector.trends, metric) }))
    .filter((sector): sector is SectorPulse & { cagr: number } => sector.cagr != null)
    .sort((a, b) => a.cagr - b.cagr)
  const maxDifference = Math.max(0.05, ...rows.map(sector => Math.abs(sector.cagr - sp500Cagr)))

  return (
    <div className="space-y-1.5">
      <p className="mb-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[9px] font-bold tracking-[0.12em] text-amber-400 lg:hidden">TAP A SECTOR TO VIEW ITS GROWTH ↓</p>
      <p className="pb-1 text-[9px] font-bold tracking-[0.12em] text-[#00ff41]/75">5Y CAGR DIFFERENCE <span className="text-[#00ff41]/40">· SECTOR GROWTH MINUS S&amp;P 500 CAGR</span></p>
      <div className="mb-2 grid grid-cols-[120px_1fr_54px] gap-2 text-[8px] font-bold tracking-wider text-[#00ff41]/70 sm:grid-cols-[180px_1fr_64px]">
        <span>SECTOR</span><span className="flex justify-between"><span>LAGGING</span><span>OUTPACING</span></span><span className="text-right leading-tight">CAGR GAP</span>
      </div>
      {rows.map(sector => {
        const difference = sector.cagr - sp500Cagr
        const width = Math.min(50, (Math.abs(difference) / maxDifference) * 50)
        const active = sector.sector === selected
        return (
          <button key={sector.sector} type="button" aria-pressed={active} onClick={() => onSelect(sector.sector)} className={`grid w-full grid-cols-[120px_1fr_54px] items-center gap-2 rounded px-1 py-2 text-left transition-colors sm:grid-cols-[180px_1fr_64px] ${active ? 'bg-[#00ff41]/10' : 'hover:bg-[#00ff41]/5'}`}>
            <span className={`truncate text-[9px] sm:text-[10px] ${active ? 'font-bold text-[#00ff41]' : 'text-[#00ff41]/55'}`}>{sector.sector}{active ? ' →' : ''}</span>
            <span className="relative h-3 rounded-sm bg-[#00ff41]/5">
              <span className="absolute bottom-[-3px] left-1/2 top-[-3px] w-px bg-white/25" />
              <span className="absolute top-0 h-3 rounded-sm" style={difference < 0
                ? { right: '50%', width: `${width}%`, background: RED, opacity: 0.65 }
                : { left: '50%', width: `${width}%`, background: GREEN, opacity: 0.65 }} />
            </span>
            <span className="text-right text-[9px] font-bold" style={{ color: difference < 0 ? RED : GREEN }}>{difference >= 0 ? '+' : ''}{(difference * 100).toFixed(1)}pt</span>
          </button>
        )
      })}
    </div>
  )
}

export default function MarketPulse({ data }: { data: MarketPulseData }) {
  const defaultSector = data.sectors[data.sectors.length - 1]?.sector ?? data.sectors[0]?.sector ?? ''
  const [selectedSector, setSelectedSector] = useState(defaultSector)
  const [valuationMetric, setValuationMetric] = useState<ValuationMetricKey>('pe')
  const [scanMetric, setScanMetric] = useState<TrendMetric>('revenue')
  const [selectedGrowthSector, setSelectedGrowthSector] = useState(defaultSector)
  const valuationDetailRef = useRef<HTMLDivElement>(null)
  const growthDetailRef = useRef<HTMLDivElement>(null)

  const selected = data.sectors.find(sector => sector.sector === selectedSector) ?? data.sectors[0]
  const selectedGrowth = data.sectors.find(sector => sector.sector === selectedGrowthSector) ?? data.sectors[0]
  const selectedValuationMetric = selected?.valuationMetrics.find(metric => metric.key === valuationMetric)
  const sectorSignals = useMemo(() => [...data.sectors].sort((a, b) => bullishPct(b.signals) - bullishPct(a.signals)), [data.sectors])
  const growthScan = useMemo(() => data.sectors
    .map(sector => ({ sector: sector.sector, cagr: metricCagr(sector.trends, scanMetric) }))
    .filter((row): row is { sector: string; cagr: number } => row.cagr != null)
    .sort((a, b) => b.cagr - a.cagr), [data.sectors, scanMetric])
  const leaders = growthScan.slice(0, 3)
  const laggards = growthScan.slice(-3).reverse()

  const opportunityLabel = data.bullishPct >= 50 ? 'BROAD' : data.bullishPct >= 30 ? 'MIXED' : 'NARROW'
  const opportunityColor = opportunityLabel === 'BROAD' ? GREEN : opportunityLabel === 'MIXED' ? AMBER : RED
  const averageMarketGrowth = useMemo(() => meanAvailable(METRICS.map(metric => metricCagr(data.marketTrends, metric.key))), [data.marketTrends])
  const marketGrowth = growthVerdict(averageMarketGrowth, data.sp500Cagr)
  const mostAttractive = data.sectors.slice(0, 3)
  const mostStretched = data.sectors.slice(-3).reverse()
  const currentPe = data.valuationMetrics.find(metric => metric.key === 'pe')?.current ?? null
  const currentFcfYield = data.valuationMetrics.find(metric => metric.key === 'fcfYield')?.current ?? null
  const currentDivYield = data.valuationMetrics.find(metric => metric.key === 'divYield')?.current ?? null
  const valuationDetail = `P/E ${formatMultiple(currentPe)} · FCF ${formatPercent(currentFcfYield)} · DIV ${formatPercent(currentDivYield)}`

  const revealOnMobile = (target: RefObject<HTMLDivElement | null>) => {
    if (!window.matchMedia('(max-width: 1023px)').matches) return
    window.requestAnimationFrame(() => target.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const selectValuationSector = (sector: string) => {
    setSelectedSector(sector)
    revealOnMobile(valuationDetailRef)
  }
  const selectGrowthSector = (sector: string) => {
    setSelectedGrowthSector(sector)
    revealOnMobile(growthDetailRef)
  }

  return (
    <main className="min-h-screen bg-black font-mono text-[#00ff41]">
      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <header className="border-b border-[#00ff41]/10 py-8 sm:py-10">
          <p className="text-[9px] tracking-[0.25em] text-[#00ff41]/35">STOCKSNACK · S&P 500 MARKET PULSE</p>
          <div className="mt-5">
            <div>
              <h1 className="text-2xl font-bold tracking-[0.04em] sm:text-3xl">HOW IS THE MARKET DOING RIGHT NOW?</h1>
              <p className="mt-3 max-w-2xl text-[11px] leading-6 text-[#00ff41]/45">Start with valuation, find the sectors causing it, then check whether StockSnack signals and business growth agree.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            <SummaryCard label="VALUATION" value={data.valuationVerdict} color={verdictColor(data.valuationVerdict)} detail={valuationDetail} emphasizeDetail />
            <SummaryCard label="STOCK OPPORTUNITY" value={opportunityLabel} color={opportunityColor} detail={`${data.bullishPct.toFixed(0)}% rated BUY or BUY+`} />
            <SummaryCard label="BUSINESS GROWTH" value={marketGrowth.label} color={marketGrowth.color} detail="Revenue · EBITDA · free cash flow" />
          </div>
        </header>

        <section className="mt-8 overflow-hidden rounded border border-[#00ff41]/20">
          <SectionHeader number="01" question="HOW IS THE MARKET PRICED?" note="Current S&P 500 company averages versus their own five-year history." />
          <div className="grid gap-3 p-3 lg:grid-cols-3 lg:p-4">
            {data.valuationMetrics.map(metric => <ValuationHistoryCard key={metric.key} metric={metric} history={data.valuationHistory} />)}
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded border border-[#00ff41]/20">
          <SectionHeader number="02" question="WHICH SECTORS ARE CAUSING IT?" note="Compare each sector’s P/E, FCF yield and dividend yield with its own five-year valuation." />
          <div className="grid gap-5 p-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <SectorDeviationPanel sectors={data.sectors} selected={selectedSector} onSelect={selectValuationSector} />
              <div className="mt-5 grid grid-cols-2 gap-3">
                <RankList title="MOST ATTRACTIVE" rows={mostAttractive} color={GREEN} selected={selectedSector} onSelect={selectValuationSector} />
                <RankList title="MOST STRETCHED" rows={mostStretched} color={RED} selected={selectedSector} onSelect={selectValuationSector} />
              </div>
            </div>
            {selected && selectedValuationMetric && (
              <div ref={valuationDetailRef} className="scroll-mt-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[9px] tracking-[0.18em] text-[#00ff41]/35">SELECTED SECTOR</p>
                    <p className="mt-1 text-sm font-bold">{selected.sector}</p>
                  </div>
                  <ValuationMetricTabs value={valuationMetric} onChange={setValuationMetric} />
                </div>
                <ValuationHistoryCard metric={selectedValuationMetric} history={selected.valuationHistory} />
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded border border-[#00ff41]/20">
          <SectionHeader number="03" question="WHAT ARE STOCKSNACK SIGNALS SAYING?" note="Breadth shows whether opportunity is spread across the market or concentrated in a few sectors." />
          <div className="p-4">
            <div className="rounded border border-[#00ff41]/15 bg-[#00ff41]/[0.015] p-4">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div><p className="text-[9px] tracking-[0.18em] text-[#00ff41]/35">ALL {data.totalStocks} STOCKS</p><p className="mt-1 text-xl font-bold">{data.bullishPct.toFixed(0)}% <span className="text-[10px] font-normal text-[#00ff41]/40">BUY / BUY+</span></p></div>
                <StatusPill label={opportunityLabel} color={opportunityColor} />
              </div>
              <SignalBar signals={data.overallSignals} showCounts />
            </div>
            <div className="mt-5 grid grid-cols-[105px_1fr_82px] items-end gap-2 border-b border-[#00ff41]/15 pb-2 text-[8px] font-bold tracking-wider text-[#00ff41]/70 sm:grid-cols-[190px_1fr_104px]">
              <span>SECTOR</span>
              <span>SIGNAL MIX</span>
              <span className="text-right leading-tight">BUY / BUY+</span>
            </div>
            <div className="mt-2 space-y-2">
              {sectorSignals.map(sector => (
                <div key={sector.sector} className="grid grid-cols-[105px_1fr_82px] items-center gap-2 sm:grid-cols-[190px_1fr_104px]">
                  <span className="truncate text-[9px] text-[#00ff41]/50">{sector.sector}</span>
                  <SignalBar signals={sector.signals} />
                  <span className="text-right text-[9px] font-bold text-[#00ff41]/65">{bullishPct(sector.signals).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded border border-[#00ff41]/20">
          <SectionHeader number="04" question="ARE S&P 500 BUSINESSES GROWING?" note="Combined market fundamentals with the same annual-bar and S&P benchmark language used on stock detail pages." />
          <div className="grid gap-3 p-3 lg:grid-cols-3 lg:p-4">
            {METRICS.map(metric => <GrowthChart key={metric.key} title={`TOTAL ${metric.label}`} points={data.marketTrends} metric={metric.key} sp500Cagr={data.sp500Cagr} subtitle="All covered S&P 500 companies combined" />)}
          </div>
          <div className="border-t border-[#00ff41]/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-[11px] font-bold tracking-[0.16em] text-[#00ff41]">SECTOR GROWTH SCAN</p><p className="mt-1 text-[10px] text-[#00ff41]/45">Compare each sector’s five-year business growth with the S&amp;P 500 benchmark.</p></div>
              <MetricTabs value={scanMetric} onChange={setScanMetric} />
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <SectorGrowthPanel sectors={data.sectors} metric={scanMetric} sp500Cagr={data.sp500Cagr} selected={selectedGrowthSector} onSelect={selectGrowthSector} />
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <GrowthRank title="TOP 3 ACCELERATING" rows={leaders} color={GREEN} selected={selectedGrowthSector} onSelect={selectGrowthSector} />
                  <GrowthRank title="BOTTOM 3 WEAKENING" rows={laggards} color={RED} selected={selectedGrowthSector} onSelect={selectGrowthSector} />
                </div>
              </div>
              {selectedGrowth && (
                <div ref={growthDetailRef} className="scroll-mt-4">
                  <div className="mb-3">
                    <p className="text-[9px] tracking-[0.18em] text-[#00ff41]/35">SELECTED SECTOR</p>
                    <p className="mt-1 text-sm font-bold">{selectedGrowth.sector}</p>
                  </div>
                  <GrowthChart title={`AVG ${METRICS.find(metric => metric.key === scanMetric)?.label} PER COMPANY`} points={selectedGrowth.trends} metric={scanMetric} sp500Cagr={data.sp500Cagr} subtitle="Annual bars · sector growth trend · S&P 500 baseline" />
                </div>
              )}
            </div>
          </div>
        </section>

        <p className="mt-10 border-t border-[#00ff41]/10 pt-4 text-center text-[8px] tracking-[0.16em] text-[#00ff41]/20">STOCKSNACK · MARKET PULSE · DATA UPDATED WEEKLY</p>
      </div>
    </main>
  )
}

function meanAvailable(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value != null)
  return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null
}

function SummaryCard({ label, value, color, detail, emphasizeDetail = false }: { label: string; value: string; color: string; detail: string; emphasizeDetail?: boolean }) {
  return (
    <div className="rounded border border-[#00ff41]/15 bg-[#00ff41]/[0.015] px-4 py-3">
      <p className="text-[10px] font-bold tracking-[0.18em] text-[#00ff41]/75">{label}</p>
      <p className="mt-1 text-lg font-bold tracking-wider" style={{ color }}>{value}</p>
      <p className={`mt-1 ${emphasizeDetail ? 'text-[9px] font-bold text-[#00ff41]/70' : 'text-[8px] text-[#00ff41]/30'}`}>{detail}</p>
    </div>
  )
}

function RankList({ title, rows, color, selected, onSelect }: { title: string; rows: SectorPulse[]; color: string; selected: string; onSelect: (sector: string) => void }) {
  return (
    <div className="rounded border p-3" style={{ borderColor: `${color}55`, background: `${color}12`, color }}>
      <p className="text-[8px] font-bold tracking-[0.14em]" style={{ color }}>{title}</p>
      <div className="mt-2 space-y-1">{rows.map((row, index) => (
        <button key={row.sector} type="button" aria-pressed={row.sector === selected} onClick={() => onSelect(row.sector)} className="flex w-full items-center rounded px-1 py-1 text-left text-[9px] transition-colors hover:bg-white/5" style={{ color, opacity: row.sector === selected ? 1 : 0.72 }}>
          <span className="mr-2 font-bold">{index + 1}</span><span className="truncate">{row.sector}</span>{row.sector === selected ? <span className="ml-auto">→</span> : null}
        </button>
      ))}</div>
    </div>
  )
}

function GrowthRank({ title, rows, color, selected, onSelect }: { title: string; rows: Array<{ sector: string; cagr: number }>; color: string; selected: string; onSelect: (sector: string) => void }) {
  return (
    <div className="rounded border p-3" style={{ borderColor: `${color}55`, background: `${color}12`, color }}>
      <p className="text-[8px] font-bold tracking-[0.14em]" style={{ color }}>{title}</p>
      <div className="mt-3 space-y-2">
        {rows.map((row, index) => (
          <button key={row.sector} type="button" aria-pressed={row.sector === selected} onClick={() => onSelect(row.sector)} className="flex w-full items-center justify-between gap-3 rounded px-1 py-1 text-left text-[9px] transition-colors hover:bg-white/5" style={{ color, opacity: row.sector === selected ? 1 : 0.72 }}>
            <span className="truncate"><span className="mr-2 font-bold">{index + 1}</span>{row.sector}{row.sector === selected ? ' →' : ''}</span>
            <span className="shrink-0 font-bold" style={{ color }}>{row.cagr >= 0 ? '+' : ''}{(row.cagr * 100).toFixed(1)}%</span>
          </button>
        ))}
      </div>
    </div>
  )
}
