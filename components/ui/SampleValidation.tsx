'use client'
import { useState } from 'react'
import type { ValidateResponse, ValidationResult } from '@/app/api/admin/validate-prices/route'

const mono = "'Courier New', Courier, monospace"
const DIM  = 'rgba(0,255,136,0.35)'
const FAINT = 'rgba(0,255,136,0.12)'

function fmt(v: number | null, prefix = '$'): string {
  if (v == null) return '—'
  return `${prefix}${v.toFixed(2)}`
}

function DiffCell({ pct, flag }: { pct: number | null; flag: boolean }) {
  if (pct == null) return <td style={{ padding: '3px 12px 3px 0', color: DIM, fontSize: 11 }}>—</td>
  return (
    <td style={{ padding: '3px 12px 3px 0', fontSize: 11, fontWeight: flag ? 'bold' : 'normal', color: flag ? '#ef4444' : pct < 3 ? DIM : '#ffcc00' }}>
      {pct.toFixed(1)}%{flag ? ' ⚠' : ''}
    </td>
  )
}

export default function SampleValidation() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [data,  setData]  = useState<ValidateResponse | null>(null)
  const [err,   setErr]   = useState<string | null>(null)

  async function run() {
    setState('loading')
    setErr(null)
    try {
      const res = await fetch('/api/admin/validate-prices', { cache: 'no-store' })
      const json: ValidateResponse = await res.json()
      if (json.error) { setErr(json.error); setState('error'); return }
      setData(json)
      setState('done')
    } catch (e) {
      setErr(String(e))
      setState('error')
    }
  }

  const flagged = data?.results.filter(r => r.priceFlag || r.peFlag).length ?? 0

  return (
    <div style={{ fontFamily: mono }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
        <button
          onClick={run}
          disabled={state === 'loading'}
          style={{
            background: state === 'loading' ? 'transparent' : '#00ff88',
            color: state === 'loading' ? DIM : '#000',
            border: `1px solid ${state === 'loading' ? DIM : '#00ff88'}`,
            borderRadius: 3,
            padding: '5px 14px',
            fontSize: 10,
            fontWeight: 'bold',
            letterSpacing: '0.12em',
            fontFamily: mono,
            cursor: state === 'loading' ? 'not-allowed' : 'pointer',
          }}
        >
          {state === 'loading' ? 'FETCHING FMP DATA…' : 'RUN VALIDATION'}
        </button>
        {state === 'done' && data && (
          <span style={{ fontSize: 10, color: flagged > 0 ? '#ef4444' : '#00ff88' }}>
            {flagged > 0 ? `${flagged} FLAGGED` : '✓ ALL WITHIN 10%'}
            <span style={{ color: DIM, marginLeft: 8 }}>{data.checkedAt.slice(0, 19).replace('T', ' ')} UTC</span>
          </span>
        )}
        {state === 'error' && <span style={{ fontSize: 10, color: '#ef4444' }}>ERROR: {err}</span>}
      </div>

      {state === 'done' && data && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {(['TICKER', 'STORED PRICE', 'FMP PRICE', 'PRICE DIFF', 'STORED P/E', 'FMP P/E', 'P/E DIFF'] as const).map(h => (
                <th key={h} style={{ textAlign: 'left', color: DIM, padding: '4px 12px 4px 0', fontWeight: 'normal', letterSpacing: '0.08em', fontSize: 9 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.results.map((r: ValidationResult) => {
              const rowBg = (r.priceFlag || r.peFlag) ? 'rgba(239,68,68,0.04)' : 'transparent'
              return (
                <tr key={r.ticker} style={{ background: rowBg, borderBottom: `1px solid ${FAINT}` }}>
                  <td style={{ padding: '3px 12px 3px 0', fontSize: 11, color: (r.priceFlag || r.peFlag) ? '#fff' : DIM }}>{r.ticker}</td>
                  <td style={{ padding: '3px 12px 3px 0', fontSize: 11 }}>{fmt(r.storedPrice)}</td>
                  <td style={{ padding: '3px 12px 3px 0', fontSize: 11, color: DIM }}>{fmt(r.fmpPrice)}</td>
                  <DiffCell pct={r.priceDiffPct} flag={r.priceFlag} />
                  <td style={{ padding: '3px 12px 3px 0', fontSize: 11 }}>{r.storedPe != null ? r.storedPe.toFixed(1) + '×' : '—'}</td>
                  <td style={{ padding: '3px 12px 3px 0', fontSize: 11, color: DIM }}>{r.fmpPe != null ? r.fmpPe.toFixed(1) + '×' : '—'}</td>
                  <DiffCell pct={r.peDiffPct} flag={r.peFlag} />
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
