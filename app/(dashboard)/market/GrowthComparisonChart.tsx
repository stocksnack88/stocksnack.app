'use client'
import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { MetricDef, YearRow } from './MetricChartPicker'

const DIM  = 'rgba(0,255,65,0.4)'
const FONT = "var(--font-geist-mono), 'Courier New', monospace"

// Rebase each selected series to its own first non-null year = 100, so
// metrics with wildly different units/magnitudes (revenue in trillions vs.
// a P/E multiple) become directly comparable as "% change since FY21".
function rebase(data: YearRow[], key: string): (number | null)[] {
  const baseIdx = data.findIndex(d => d[key] != null && d[key] !== 0)
  if (baseIdx === -1) return data.map(() => null)
  const base = data[baseIdx][key] as number
  return data.map(d => (d[key] == null ? null : (d[key] as number) / base * 100))
}

export default function GrowthComparisonChart({
  metrics, data, defaultSelected,
}: {
  metrics: MetricDef[]
  data: YearRow[]
  defaultSelected: string[]
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelected)

  function toggle(key: string) {
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const indexedData = data.map((d, i) => {
    const row: { year: number; [key: string]: number | null } = { year: d.year }
    for (const m of metrics) row[m.key] = rebase(data, m.key)[i]
    return row
  })
  const activeMetrics = metrics.filter(m => selected.includes(m.key))

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {metrics.map(m => {
          const active = selected.includes(m.key)
          return (
            <button
              key={m.key}
              onClick={() => toggle(m.key)}
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

      {activeMetrics.length === 0 ? (
        <p style={{ fontSize: 11, color: DIM, fontFamily: FONT, padding: '2rem 0', textAlign: 'center' }}>
          Pick at least one metric to compare.
        </p>
      ) : (
        <>
          {/* legend */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, fontFamily: FONT, fontSize: 9 }}>
            {activeMetrics.map(m => (
              <span key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 5, color: DIM }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color, display: 'inline-block' }} />
                {m.label}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={indexedData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
                tickFormatter={v => `${v}`}
                width={40}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div style={{ background: '#000', border: '1px solid rgba(0,255,65,0.2)', padding: '8px 12px', fontFamily: FONT, fontSize: 11 }}>
                      <p style={{ color: DIM, margin: '0 0 4px' }}>FY{label}</p>
                      {payload.map((p, i) => {
                        const m = activeMetrics.find(x => x.key === p.dataKey)
                        const v = p.value as number
                        return (
                          <p key={i} style={{ color: m?.color, margin: '2px 0' }}>
                            {m?.label}: {v != null ? `${v.toFixed(1)}` : '—'}
                          </p>
                        )
                      })}
                    </div>
                  )
                }}
              />
              {activeMetrics.map(m => (
                <Line
                  key={m.key}
                  type="monotone"
                  dataKey={m.key}
                  stroke={m.color}
                  strokeWidth={2}
                  dot={{ fill: m.color, r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <p style={{ fontSize: 9, color: 'rgba(0,255,65,0.25)', margin: '10px 0 0' }}>
            Each line rebased to its own FY21 value = 100, so growth rates are directly comparable regardless of original units.
          </p>
        </>
      )}
    </div>
  )
}
