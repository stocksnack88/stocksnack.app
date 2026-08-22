'use client'
import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

// 'format' used to be a function prop, but Server Components can't pass
// functions to Client Components (not serializable across that boundary) --
// hence 'kind', mapped to a formatter locally instead.
export type MetricKind = 'currency' | 'multiple' | 'pct'

export type MetricDef = {
  key: string
  label: string
  color: string
  kind: MetricKind
}

export type YearRow = { year: number; [key: string]: number | null }

const GREEN = '#00ff41'
const DIM   = 'rgba(0,255,65,0.4)'
const FONT  = "var(--font-geist-mono), 'Courier New', monospace"

function formatValue(v: number, kind: MetricKind): string {
  if (kind === 'multiple') return `${v.toFixed(1)}x`
  if (kind === 'pct') return `${(v * 100).toFixed(2)}%`
  const abs = Math.abs(v)
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(1)}T`
  if (abs >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`
  return `$${(v / 1e6).toFixed(0)}M`
}

function yoy(curr: number | null, prev: number | null): string {
  if (curr == null || prev == null || prev === 0) return '—'
  const p = ((curr - prev) / Math.abs(prev)) * 100
  return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`
}
function yoyColor(curr: number | null, prev: number | null): string {
  if (curr == null || prev == null || prev === 0) return DIM
  return curr >= prev ? '#00ff41' : '#ef4444'
}

export default function MetricChartPicker({
  metrics, data, defaultSelected,
}: {
  metrics: MetricDef[]
  data: YearRow[]
  defaultSelected: string[]
}) {
  // Single-select swap, not multi-toggle: clicking a pill shows ONLY that
  // metric's chart, keeping exactly one chart on screen at a time. 'ALL'
  // is the one exception -- it shows every metric stacked, same as the
  // old multi-select behavior used to when everything was toggled on.
  const [selectedKey, setSelectedKey] = useState<string>(defaultSelected[0] ?? metrics[0]?.key ?? 'ALL')

  const shownMetrics = selectedKey === 'ALL' ? metrics : metrics.filter(m => m.key === selectedKey)

  return (
    <div>
      {/* picker pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <button
          onClick={() => setSelectedKey('ALL')}
          style={{
            fontFamily: FONT, fontSize: 10, fontWeight: 'bold', letterSpacing: '0.08em',
            padding: '6px 14px', borderRadius: 4, cursor: 'pointer',
            border: `1px solid ${selectedKey === 'ALL' ? GREEN : 'rgba(0,255,65,0.2)'}`,
            background: selectedKey === 'ALL' ? GREEN : 'transparent',
            color: selectedKey === 'ALL' ? '#000' : 'rgba(0,255,65,0.5)',
            transition: 'all 0.15s',
          }}
        >
          ALL
        </button>
        {metrics.map(m => {
          const active = selectedKey === m.key
          return (
            <button
              key={m.key}
              onClick={() => setSelectedKey(m.key)}
              style={{
                fontFamily: FONT, fontSize: 10, fontWeight: 'bold', letterSpacing: '0.08em',
                padding: '6px 14px', borderRadius: 4, cursor: 'pointer',
                border: `1px solid ${active ? m.color : 'rgba(0,255,65,0.2)'}`,
                background: active ? m.color : 'transparent',
                color: active ? '#000' : 'rgba(0,255,65,0.5)',
                transition: 'all 0.15s',
              }}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {/* one chart, unless ALL is selected */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {shownMetrics.map(m => (
          <div key={m.key}>
            <p style={{ fontSize: 9, letterSpacing: '0.18em', color: DIM, marginBottom: '0.6rem', fontFamily: FONT }}>
              {m.label}
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
                  tickFormatter={v => formatValue(v, m.kind)}
                  width={56}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const v = payload[0].value as number
                    return (
                      <div style={{ background: '#000', border: '1px solid rgba(0,255,65,0.2)', padding: '6px 10px', fontFamily: FONT, fontSize: 11 }}>
                        <p style={{ color: DIM, margin: '0 0 2px' }}>FY{label}</p>
                        <p style={{ color: m.color, margin: 0 }}>{v != null ? formatValue(v, m.kind) : '—'}</p>
                      </div>
                    )
                  }}
                />
                <Line
                  type="monotone"
                  dataKey={m.key}
                  stroke={m.color}
                  strokeWidth={2}
                  dot={{ fill: m.color, r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
            {/* per-year YoY strip */}
            <div style={{ display: 'flex', borderTop: '1px solid rgba(0,255,136,0.08)', marginTop: 4, paddingTop: 6, fontFamily: FONT, fontSize: 9 }}>
              {data.slice(1).map((d, i) => {
                const prev = data[i]
                return (
                  <div key={d.year} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ color: DIM }}>FY{String(d.year).slice(2)}</div>
                    <div style={{ color: yoyColor(d[m.key], prev[m.key]), fontWeight: 'bold', marginTop: 2 }}>
                      {yoy(d[m.key], prev[m.key])}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
