'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TickerTypeahead, { type TickerOption } from './TickerTypeahead'
import type { Mode } from './compareData'

type ModeLabel = 'STOCK vs STOCK' | 'STOCK vs S&P 500' | 'STOCK vs INDUSTRY'
const MODES: { label: ModeLabel; mode: Mode }[] = [
  { label: 'STOCK vs STOCK', mode: 'STOCK_VS_STOCK' },
  { label: 'STOCK vs S&P 500', mode: 'STOCK_VS_SP500' },
  { label: 'STOCK vs INDUSTRY', mode: 'STOCK_VS_INDUSTRY' },
]

const MONO = "var(--font-geist-mono), 'Courier New', monospace"
const GREEN = '#00ff41'
const DIM = 'rgba(0,255,65,0.4)'
const FAINT = 'rgba(0,255,65,0.1)'

export default function CompareInputs({
  options,
  initialMode,
  initialTickerA,
  initialTickerB,
}: {
  options: TickerOption[]
  initialMode: Mode
  initialTickerA: string
  initialTickerB: string
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [tickerA, setTickerA] = useState(initialTickerA)
  const [tickerB, setTickerB] = useState(initialTickerB)

  const modeLabel = MODES.find(m => m.mode === mode)?.label ?? 'STOCK vs STOCK'
  const needsB = mode === 'STOCK_VS_STOCK'
  const canSubmit = tickerA.length > 0 && (!needsB || tickerB.length > 0)

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

  function submit() {
    if (!canSubmit) return
    const params = new URLSearchParams({ mode, tickerA })
    if (needsB) params.set('tickerB', tickerB)
    router.push(`/compare?${params.toString()}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* mode toggle */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {MODES.map(m => (
          <button key={m.mode} style={btnStyle(m.mode === mode)} onClick={() => setMode(m.mode)}>
            {m.label}
          </button>
        ))}
      </div>

      {/* stock inputs */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <TickerTypeahead
          label="STOCK A"
          placeholder="AAPL"
          value={tickerA}
          options={options}
          onChange={setTickerA}
        />

        <div style={{ paddingTop: 26, color: 'rgba(0,255,65,0.3)', fontFamily: MONO, fontSize: 18, flexShrink: 0 }}>
          vs
        </div>

        {needsB ? (
          <TickerTypeahead
            label="STOCK B"
            placeholder="MSFT"
            value={tickerB}
            options={options}
            onChange={setTickerB}
          />
        ) : (
          <div style={{ flex: 1, minWidth: 160 }}>
            <p style={{ fontSize: 9, color: DIM, fontFamily: MONO, letterSpacing: '0.15em', marginBottom: 6 }}>
              BENCHMARK
            </p>
            <div style={{
              background: 'rgba(0,255,65,0.03)',
              border: '1px solid rgba(0,255,65,0.2)',
              borderRadius: 4,
              color: DIM,
              fontFamily: MONO,
              fontSize: 13,
              padding: '10px 14px',
              letterSpacing: '0.1em',
            }}>
              {modeLabel === 'STOCK vs S&P 500' ? 'S&P 500' : 'INDUSTRY AVG'}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={submit}
        disabled={!canSubmit}
        style={{
          alignSelf: 'flex-start',
          background: canSubmit ? GREEN : 'rgba(0,255,65,0.1)',
          color: canSubmit ? '#000' : 'rgba(0,255,65,0.3)',
          border: 'none',
          borderRadius: 4,
          fontFamily: MONO,
          fontWeight: 'bold',
          fontSize: 11,
          letterSpacing: '0.12em',
          padding: '10px 20px',
          cursor: canSubmit ? 'pointer' : 'default',
        }}
      >
        COMPARE →
      </button>

      <p style={{ fontSize: 9, color: 'rgba(0,255,65,0.2)', fontFamily: MONO, letterSpacing: '0.1em', borderTop: `1px solid ${FAINT}`, paddingTop: '0.75rem', margin: 0 }}>
        TYPE A TICKER OR NAME TO SEARCH
      </p>
    </div>
  )
}
