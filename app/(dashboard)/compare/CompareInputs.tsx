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

  function submit() {
    if (!canSubmit) return
    const params = new URLSearchParams({ mode, tickerA })
    if (needsB) params.set('tickerB', tickerB)
    router.push(`/compare?${params.toString()}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <style>{`
        .compare-mode-row { display: flex; gap: 6px; }
        .compare-mode-row button { flex: 1; }
        @media (max-width: 480px) {
          .compare-mode-row { flex-direction: column; }
        }
        .compare-input-row { display: flex; gap: 8px; align-items: flex-end; }
        @media (max-width: 420px) {
          .compare-input-row { flex-wrap: wrap; }
        }
      `}</style>

      {/* filter 1 -- comparison type */}
      <p style={{ fontSize: 8, color: DIM, fontFamily: MONO, letterSpacing: '0.15em', margin: 0 }}>
        FILTER 1
      </p>
      <div className="compare-mode-row">
        {MODES.map(m => (
          <button
            key={m.mode}
            onClick={() => setMode(m.mode)}
            style={{
              background: m.mode === mode ? 'rgba(0,255,65,0.1)' : 'none',
              border: `1px solid ${m.mode === mode ? 'rgba(0,255,65,0.4)' : 'rgba(0,255,65,0.15)'}`,
              color: m.mode === mode ? GREEN : DIM,
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: '0.08em',
              padding: '6px 8px',
              cursor: 'pointer',
              borderRadius: 3,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* filter 2 -- which stocks */}
      <p style={{ fontSize: 8, color: DIM, fontFamily: MONO, letterSpacing: '0.15em', margin: '0.4rem 0 0' }}>
        FILTER 2
      </p>
      <div className="compare-input-row">
        <TickerTypeahead
          label="STOCK A"
          placeholder="AAPL"
          value={tickerA}
          options={options}
          onChange={setTickerA}
        />

        <span style={{ color: 'rgba(0,255,65,0.3)', fontFamily: MONO, fontSize: 13, flexShrink: 0, paddingBottom: 8 }}>
          vs
        </span>

        {needsB ? (
          <TickerTypeahead
            label="STOCK B"
            placeholder="MSFT"
            value={tickerB}
            options={options}
            onChange={setTickerB}
          />
        ) : (
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{
              background: 'rgba(0,255,65,0.03)',
              border: '1px solid rgba(0,255,65,0.2)',
              borderRadius: 4,
              color: DIM,
              fontFamily: MONO,
              fontSize: 12,
              padding: '7px 10px',
              letterSpacing: '0.06em',
            }}>
              {modeLabel === 'STOCK vs S&P 500' ? 'S&P 500' : 'INDUSTRY AVG'}
            </div>
          </div>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            flexShrink: 0,
            background: canSubmit ? GREEN : 'rgba(0,255,65,0.1)',
            color: canSubmit ? '#000' : 'rgba(0,255,65,0.3)',
            border: 'none',
            borderRadius: 4,
            fontFamily: MONO,
            fontWeight: 'bold',
            fontSize: 10,
            letterSpacing: '0.08em',
            padding: '8px 14px',
            cursor: canSubmit ? 'pointer' : 'default',
          }}
        >
          GO →
        </button>
      </div>
    </div>
  )
}
