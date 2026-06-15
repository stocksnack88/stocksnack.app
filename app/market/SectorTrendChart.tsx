'use client'
import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

export type SectorYearData = {
  sector: string
  year: number
  revenue: number | null
  ebitda: number | null
  fcf: number | null
  avgGrossMargin: number | null
}

type Metric = 'Revenue' | 'EBITDA' | 'FCF'

const FONT = "'Courier New', Courier, monospace"
const DIM  = 'rgba(0,255,136,0.35)'

const SECTOR_COLORS: Record<string, string> = {
  'Information Technology': '#00ff88',
  'Technology':             '#00ff88',
  'Health Care':            '#3b82f6',
  'Financials':             '#f59e0b',
  'Consumer Discretionary': '#ef4444',
  'Communication Services': '#a855f7',
  'Industrials':            '#06b6d4',
  'Consumer Staples':       '#84cc16',
  'Energy':                 '#f97316',
  'Real Estate':            '#ec4899',
  'Materials':              '#14b8a6',
  'Utilities':              '#6366f1',
  'Other':                  '#94a3b8',
}

const FALLBACK_COLORS = [
  '#00ff88','#3b82f6','#f59e0b','#ef4444','#a855f7',
  '#06b6d4','#84cc16','#f97316','#ec4899','#14b8a6','#6366f1','#94a3b8',
]

function getColor(sector: string, idx: number): string {
  return SECTOR_COLORS[sector] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

function fmtB(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(1)}T`
  if (abs >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`
  return `$${(v / 1e6).toFixed(0)}M`
}

const MetricKey: Record<Metric, keyof SectorYearData> = {
  Revenue: 'revenue',
  EBITDA:  'ebitda',
  FCF:     'fcf',
}

function buildChartData(
  sectorYears: SectorYearData[],
  sectors: string[],
  key: keyof SectorYearData,
  years: number[],
) {
  return years.map(y => {
    const row: Record<string, number | null | number> = { year: y }
    for (const s of sectors) {
      const d = sectorYears.find(sd => sd.sector === s && sd.year === y)
      row[s] = (d?.[key] as number | null) ?? null
    }
    return row
  })
}

const SectorTooltip = ({ active, payload, label, formatter }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: number
  formatter: (v: number) => string
}) => {
  if (!active || !payload?.length) return null
  const sorted = [...payload].filter(p => p.value != null).sort((a, b) => b.value - a.value)
  return (
    <div style={{
      background: '#080808', border: '1px solid rgba(0,255,136,0.2)',
      padding: '8px 12px', fontFamily: FONT, fontSize: 10, maxWidth: 220,
    }}>
      <p style={{ color: DIM, marginBottom: 6, fontSize: 9 }}>FY{label}</p>
      {sorted.map(p => (
        <p key={p.name} style={{ color: p.color, margin: '2px 0' }}>
          <span style={{ color: DIM }}>{p.name.length > 18 ? p.name.slice(0, 18) + '…' : p.name}: </span>
          {formatter(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function SectorTrendChart({ sectorYears }: { sectorYears: SectorYearData[] }) {
  const [metric, setMetric] = useState<Metric>('Revenue')

  const sectors = Array.from(new Set(sectorYears.map(d => d.sector))).sort()
  const years   = Array.from(new Set(sectorYears.map(d => d.year))).sort()

  const revenueData = buildChartData(sectorYears, sectors, MetricKey[metric], years)
  const healthData  = buildChartData(sectorYears, sectors, 'avgGrossMargin', years)

  const btnStyle = (active: boolean) => ({
    background: active ? 'rgba(0,255,136,0.12)' : 'none',
    border: `1px solid ${active ? 'rgba(0,255,136,0.45)' : 'rgba(0,255,136,0.18)'}`,
    color: active ? '#00ff88' : DIM,
    padding: '4px 12px',
    cursor: 'pointer',
    fontFamily: FONT,
    fontSize: 10,
    letterSpacing: '0.12em',
    borderRadius: 3,
  } as React.CSSProperties)

  return (
    <div>
      {/* toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
        {(['Revenue', 'EBITDA', 'FCF'] as Metric[]).map(m => (
          <button key={m} style={btnStyle(metric === m)} onClick={() => setMetric(m)}>
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Sector financial trend chart */}
      <p style={{ fontSize: 9, letterSpacing: '0.15em', color: DIM, fontFamily: FONT, marginBottom: 8 }}>
        AVG {metric.toUpperCase()} PER COMPANY BY SECTOR (FY21–FY25)
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={revenueData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,255,136,0.07)" vertical={false} />
          <XAxis
            dataKey="year"
            tick={{ fill: DIM, fontSize: 9, fontFamily: FONT }}
            axisLine={false} tickLine={false}
            tickFormatter={v => `FY${String(v).slice(2)}`}
          />
          <YAxis
            tick={{ fill: DIM, fontSize: 8, fontFamily: FONT }}
            axisLine={false} tickLine={false}
            tickFormatter={v => fmtB(v)}
            width={56}
          />
          <Tooltip content={<SectorTooltip formatter={fmtB} />} />
          {sectors.map((s, i) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              stroke={getColor(s, i)}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* color legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 12, marginBottom: '2rem' }}>
        {sectors.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 18, height: 2, background: getColor(s, i), borderRadius: 1 }} />
            <span style={{ fontSize: 9, color: DIM, fontFamily: FONT, letterSpacing: '0.08em' }}>
              {s}
            </span>
          </div>
        ))}
      </div>

      {/* Sector health (gross margin) chart */}
      <p style={{ fontSize: 9, letterSpacing: '0.15em', color: DIM, fontFamily: FONT, marginBottom: 8 }}>
        AVG GROSS MARGIN BY SECTOR (FY21–FY25)
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={healthData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,255,136,0.07)" vertical={false} />
          <XAxis
            dataKey="year"
            tick={{ fill: DIM, fontSize: 9, fontFamily: FONT }}
            axisLine={false} tickLine={false}
            tickFormatter={v => `FY${String(v).slice(2)}`}
          />
          <YAxis
            tick={{ fill: DIM, fontSize: 8, fontFamily: FONT }}
            axisLine={false} tickLine={false}
            tickFormatter={v => `${(v * 100).toFixed(0)}%`}
            width={40}
          />
          <Tooltip content={<SectorTooltip formatter={v => `${(v * 100).toFixed(1)}%`} />} />
          {sectors.map((s, i) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              stroke={getColor(s, i)}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
