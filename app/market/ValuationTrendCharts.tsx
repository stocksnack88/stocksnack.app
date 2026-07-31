'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

export type ValuationYear = {
  year: number
  pe: number | null
  evEbitda: number | null
  fcfYield: number | null
  divYield: number | null
}

const GREEN = '#00ff41'
const DIM   = 'rgba(0,255,65,0.35)'
const FONT  = "var(--font-geist-mono), 'Courier New', monospace"

type Kind = 'multiple' | 'pct'

function fmtVal(v: number, kind: Kind): string {
  return kind === 'multiple' ? `${v.toFixed(1)}x` : `${(v * 100).toFixed(2)}%`
}

const CustomTooltip = ({ active, payload, label, kind }: {
  active?: boolean
  payload?: Array<{ value: number; color: string }>
  label?: number
  kind: Kind
}) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#000', border: '1px solid rgba(0,255,65,0.2)',
      padding: '8px 12px', fontFamily: FONT, fontSize: 11,
    }}>
      <p style={{ color: DIM, marginBottom: 4 }}>FY{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>
          {p.value != null ? fmtVal(p.value, kind) : '—'}
        </p>
      ))}
    </div>
  )
}

function SingleChart({
  title, dataKey, data, color, kind,
}: {
  title: string
  dataKey: 'pe' | 'evEbitda' | 'fcfYield' | 'divYield'
  data: ValuationYear[]
  color: string
  kind: Kind
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 9, letterSpacing: '0.18em', color: DIM, marginBottom: '0.75rem', fontFamily: FONT }}>
        {title}
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
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
            tickFormatter={v => fmtVal(v, kind)}
            width={44}
          />
          <Tooltip content={<CustomTooltip kind={kind} />} />
          <Bar dataKey={dataKey} fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* per-year values */}
      <div style={{
        display: 'flex', gap: 0,
        borderTop: '1px solid rgba(0,255,136,0.08)', marginTop: 6, paddingTop: 8,
        fontFamily: FONT, fontSize: 9,
      }}>
        {data.map(d => (
          <div key={d.year} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ color: DIM }}>FY{String(d.year).slice(2)}</div>
            <div style={{ color, fontWeight: 'bold', marginTop: 2 }}>
              {d[dataKey] != null ? fmtVal(d[dataKey]!, kind) : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ValuationTrendCharts({ data }: { data: ValuationYear[] }) {
  return (
    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
      <SingleChart title="P/E RATIO"       dataKey="pe"       data={data} color={GREEN}     kind="multiple" />
      <SingleChart title="EV/EBITDA"       dataKey="evEbitda" data={data} color="#f59e0b"   kind="multiple" />
      <SingleChart title="FCF YIELD"       dataKey="fcfYield" data={data} color="#3b82f6"   kind="pct" />
      <SingleChart title="DIVIDEND YIELD"  dataKey="divYield" data={data} color="#d55181"   kind="pct" />
    </div>
  )
}
