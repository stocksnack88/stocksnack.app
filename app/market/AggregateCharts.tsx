'use client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

export type AggregateYear = {
  year: number
  revenue: number | null
  ebitda: number | null
  fcf: number | null
}

const GREEN = '#00ff41'
const DIM   = 'rgba(0,255,65,0.35)'
const FONT  = "var(--font-geist-mono), 'Courier New', monospace"

function fmtT(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(1)}T`
  if (abs >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`
  return `$${(v / 1e6).toFixed(0)}M`
}

function yoy(curr: number | null, prev: number | null): string {
  if (curr == null || prev == null || prev === 0) return '—'
  const pct = ((curr - prev) / Math.abs(prev)) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

function yoyColor(curr: number | null, prev: number | null): string {
  if (curr == null || prev == null || prev === 0) return DIM
  return curr >= prev ? GREEN : '#ef4444'
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; color: string; name: string }>
  label?: number
}) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#000', border: '1px solid rgba(0,255,65,0.2)',
      padding: '8px 12px', fontFamily: FONT, fontSize: 11,
    }}>
      <p style={{ color: DIM, marginBottom: 4 }}>FY{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, margin: '2px 0' }}>
          {p.value != null ? fmtT(p.value) : '—'}
        </p>
      ))}
    </div>
  )
}

function SingleChart({
  title, dataKey, data, color,
}: {
  title: string
  dataKey: 'revenue' | 'ebitda' | 'fcf'
  data: AggregateYear[]
  color: string
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 9, letterSpacing: '0.18em', color: DIM, marginBottom: '0.75rem', fontFamily: FONT }}>
        {title}
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,255,65,0.07)" vertical={false} />
          <XAxis
            dataKey="year"
            tick={{ fill: DIM, fontSize: 9, fontFamily: FONT }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `FY${String(v).slice(2)}`}
          />
          <YAxis
            tick={{ fill: DIM, fontSize: 8, fontFamily: FONT }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => fmtT(v)}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={{ fill: color, r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>

      {/* YoY % change */}
      <div style={{
        display: 'flex', gap: 0,
        borderTop: '1px solid rgba(0,255,136,0.08)', marginTop: 6, paddingTop: 8,
        fontFamily: FONT, fontSize: 9,
      }}>
        {data.slice(1).map((d, i) => {
          const prev = data[i]
          const val = d[dataKey]
          const pval = prev[dataKey]
          return (
            <div key={d.year} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ color: DIM }}>FY{String(d.year).slice(2)}</div>
              <div style={{ color: yoyColor(val, pval), fontWeight: 'bold', marginTop: 2 }}>
                {yoy(val, pval)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AggregateCharts({ data }: { data: AggregateYear[] }) {
  return (
    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
      <SingleChart title="TOTAL REVENUE" dataKey="revenue" data={data} color={GREEN} />
      <SingleChart title="TOTAL EBITDA"  dataKey="ebitda"  data={data} color="#f59e0b" />
      <SingleChart title="TOTAL FCF"     dataKey="fcf"     data={data} color="#3b82f6" />
    </div>
  )
}
