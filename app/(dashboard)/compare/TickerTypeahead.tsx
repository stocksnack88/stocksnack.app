'use client'
import { useEffect, useRef, useState } from 'react'

const MONO = "var(--font-geist-mono), 'Courier New', monospace"
const GREEN = '#00ff41'
const DIM = 'rgba(0,255,65,0.4)'

export type TickerOption = { ticker: string; name: string | null }

export default function TickerTypeahead({
  label,
  placeholder,
  value,
  options,
  onChange,
}: {
  label: string
  placeholder: string
  value: string
  options: TickerOption[]
  onChange: (ticker: string) => void
}) {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setText(value) }, [value])

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onOutside)
    return () => document.removeEventListener('click', onOutside)
  }, [open])

  const q = text.trim().toUpperCase()
  const matches = q
    ? options
        .filter(o => o.ticker.toUpperCase().startsWith(q) || (o.name ?? '').toUpperCase().includes(q))
        .slice(0, 8)
    : []

  const isValid = options.some(o => o.ticker.toUpperCase() === q)

  const inputStyle = {
    background: 'rgba(0,255,65,0.03)',
    border: `1px solid ${isValid || !text ? 'rgba(0,255,65,0.2)' : 'rgba(239,68,68,0.4)'}`,
    borderRadius: 4,
    color: GREEN,
    fontFamily: MONO,
    fontSize: 12,
    padding: '7px 10px',
    outline: 'none',
    width: '100%',
    letterSpacing: '0.08em',
  } as React.CSSProperties

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 96 }}>
      <p style={{ fontSize: 8, color: DIM, fontFamily: MONO, letterSpacing: '0.12em', marginBottom: 3 }}>
        {label}
      </p>
      <input
        value={text}
        onChange={e => {
          const next = e.target.value.toUpperCase()
          setText(next)
          setOpen(true)
          const exact = options.find(o => o.ticker.toUpperCase() === next.trim())
          onChange(exact ? exact.ticker : '')
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        maxLength={10}
        style={inputStyle}
      />
      {text && !isValid && (
        <p style={{ fontSize: 9, color: '#ef4444', marginTop: 4, letterSpacing: '0.08em' }}>
          TICKER NOT FOUND
        </p>
      )}
      {open && matches.length > 0 && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#000',
            border: '1px solid rgba(0,255,65,0.2)',
            borderRadius: 4,
            zIndex: 50,
            maxHeight: 220,
            overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
          }}
        >
          {matches.map(m => (
            <button
              key={m.ticker}
              type="button"
              onClick={() => {
                setText(m.ticker)
                onChange(m.ticker)
                setOpen(false)
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid rgba(0,255,65,0.08)',
                padding: '8px 12px',
                cursor: 'pointer',
                fontFamily: MONO,
                fontSize: 11,
                color: GREEN,
              }}
            >
              <span style={{ fontWeight: 'bold' }}>{m.ticker}</span>
              {m.name && <span style={{ color: DIM, marginLeft: 8, fontSize: 10 }}>{m.name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
