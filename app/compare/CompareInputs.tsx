'use client'
import { useState } from 'react'

type Mode = 'STOCK vs STOCK' | 'STOCK vs S&P 500' | 'STOCK vs INDUSTRY'
const MODES: Mode[] = ['STOCK vs STOCK', 'STOCK vs S&P 500', 'STOCK vs INDUSTRY']

const MONO = "var(--font-geist-mono), 'Courier New', monospace"
const GREEN = '#00ff41'
const DIM = 'rgba(0,255,65,0.4)'
const FAINT = 'rgba(0,255,65,0.1)'

export default function CompareInputs() {
  const [mode, setMode] = useState<Mode>('STOCK vs STOCK')
  const [tickerA, setTickerA] = useState('')
  const [tickerB, setTickerB] = useState('')

  const inputStyle = {
    background: 'rgba(0,255,65,0.03)',
    border: '1px solid rgba(0,255,65,0.2)',
    borderRadius: 4,
    color: GREEN,
    fontFamily: MONO,
    fontSize: 13,
    padding: '10px 14px',
    outline: 'none',
    width: '100%',
    letterSpacing: '0.1em',
  } as React.CSSProperties

  const btnStyle = (active: boolean) => ({
    background: active ? 'rgba(0,255,65,0.1)' : 'none',
    border: `1px solid ${active ? 'rgba(0,255,65,0.4)' : 'rgba(0,255,65,0.15)'}`,
    color: active ? GREEN : DIM,
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.12em',
    padding: '6px 14px',
    cursor: 'pointer',
    borderRadius: 3,
    transition: 'all 0.15s',
  } as React.CSSProperties)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* mode toggle */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {MODES.map(m => (
          <button key={m} style={btnStyle(mode === m)} onClick={() => setMode(m)}>
            {m}
          </button>
        ))}
      </div>

      {/* stock inputs */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <p style={{ fontSize: 9, color: DIM, fontFamily: MONO, letterSpacing: '0.15em', marginBottom: 6 }}>
            STOCK A
          </p>
          <input
            value={tickerA}
            onChange={e => setTickerA(e.target.value.toUpperCase())}
            placeholder="AAPL"
            maxLength={10}
            style={inputStyle}
          />
        </div>

        <div style={{ paddingTop: 20, color: 'rgba(0,255,65,0.3)', fontFamily: MONO, fontSize: 18, flexShrink: 0 }}>
          vs
        </div>

        {mode === 'STOCK vs STOCK' ? (
          <div style={{ flex: 1, minWidth: 160 }}>
            <p style={{ fontSize: 9, color: DIM, fontFamily: MONO, letterSpacing: '0.15em', marginBottom: 6 }}>
              STOCK B
            </p>
            <input
              value={tickerB}
              onChange={e => setTickerB(e.target.value.toUpperCase())}
              placeholder="MSFT"
              maxLength={10}
              style={inputStyle}
            />
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 160 }}>
            <p style={{ fontSize: 9, color: DIM, fontFamily: MONO, letterSpacing: '0.15em', marginBottom: 6 }}>
              BENCHMARK
            </p>
            <div style={{
              ...inputStyle,
              color: DIM,
              display: 'flex', alignItems: 'center',
            }}>
              {mode === 'STOCK vs S&P 500' ? 'S&P 500' : 'INDUSTRY AVG'}
            </div>
          </div>
        )}
      </div>

      {/* placeholder note */}
      <p style={{ fontSize: 9, color: 'rgba(0,255,65,0.2)', fontFamily: MONO, letterSpacing: '0.1em', borderTop: `1px solid ${FAINT}`, paddingTop: '0.75rem' }}>
        TYPEAHEAD SEARCH COMING SOON — ENTER TICKER DIRECTLY FOR NOW
      </p>
    </div>
  )
}
