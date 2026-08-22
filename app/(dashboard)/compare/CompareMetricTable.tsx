'use client'
import { Fragment, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CompareSection, CompareMetricRow } from './compareData'
import { rowWinner } from './compareData'

const GREEN = '#00ff41'
const FAINT = 'rgba(0,255,65,0.1)'
const MONO: CSSProperties = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }

function displayValue(row: CompareMetricRow, side: 'A' | 'B'): string {
  const v = side === 'A' ? row.valueA : row.valueB
  if (row.format) return row.format(v)
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'PASS' : 'FAIL'
  return String(v)
}

// Solid pill badge -- same look as the PRO badge / GO button (solid color,
// black text), not just colored text, so a win/loss reads at a glance.
function Badge({ win, children }: { win: boolean; children: string }) {
  return (
    <span style={{
      display: 'inline-block',
      background: win ? GREEN : '#ef4444',
      color: '#000',
      fontWeight: 'bold',
      padding: '2px 7px',
      borderRadius: 3,
    }}>
      {children}
    </span>
  )
}

// Each value renders as a badge (winner green, loser red) instead of a
// separate "A"/"B"/"TIE" column -- the column header is already the real
// ticker, so a green badge under it says "MSFT wins this row" on its own.
// Pass/fail rows badge straight off PASS-vs-FAIL rather than routing
// through rowWinner's A/B framing, since a PASS is good regardless of what
// the other side did. True ties (within the comparison band) get no badge,
// just the plain value in brackets.
function Cell({ row, side }: { row: CompareMetricRow; side: 'A' | 'B' }) {
  const value = side === 'A' ? row.valueA : row.valueB
  const text = displayValue(row, side)

  if (row.direction === 'none') {
    return <span style={{ color: 'rgba(0,255,65,0.55)' }}>{text}</span>
  }
  if (row.direction === 'pass-fail') {
    if (typeof value !== 'boolean') return <span style={{ color: 'rgba(0,255,65,0.15)' }}>{text}</span>
    return <Badge win={value}>{text}</Badge>
  }
  const winner = rowWinner(row)
  if (winner === null) return <span style={{ color: 'rgba(0,255,65,0.15)' }}>{text}</span>
  if (winner === 'TIE') return <span style={{ color: 'rgba(255,255,255,0.5)' }}>({text})</span>
  return <Badge win={winner === side}>{text}</Badge>
}

// Fixed % column widths (no separate WINNER column) -- same approach as the
// Pricing table's <colgroup>, so long metric labels and long values wrap
// onto a second line instead of forcing the table wider than a phone screen.
export function CompareMetricTable({ section, labelA, labelB }: { section: CompareSection; labelA: string; labelB: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(label: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return (
    <div style={{
      border: '1px solid rgba(0,255,65,0.2)',
      background: 'rgba(0,255,65,0.02)',
      borderRadius: 4,
      overflow: 'hidden',
      ...MONO,
    }}>
      <div style={{
        background: '#001a00',
        borderBottom: `1px solid ${FAINT}`,
        padding: '1rem 1.25rem',
      }}>
        <p style={{ fontSize: 12, fontWeight: 'bold', letterSpacing: '0.1em', color: GREEN, margin: 0 }}>
          {section.title}
        </p>
      </div>
      <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 10 }}>
        <colgroup>
          <col style={{ width: '42%' }} />
          <col style={{ width: '29%' }} />
          <col style={{ width: '29%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={thStyle('left')} />
            <th style={thStyle('center')}>{labelA}</th>
            <th style={thStyle('center')}>{labelB}</th>
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, i) => (
            <Fragment key={`${row.label}-${i}`}>
              <tr style={{ background: i % 2 === 1 ? 'rgba(0,255,65,0.018)' : 'transparent' }}>
                <td style={tdStyle('left')}>
                  {row.label}
                  {row.info && (
                    <button
                      onClick={() => toggle(row.label)}
                      aria-label={`About ${row.label}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 13,
                        height: 13,
                        marginLeft: 5,
                        borderRadius: '50%',
                        border: '1px solid rgba(0,255,65,0.4)',
                        background: expanded.has(row.label) ? 'rgba(0,255,65,0.15)' : 'none',
                        color: 'rgba(0,255,65,0.6)',
                        fontSize: 9,
                        fontWeight: 'bold',
                        lineHeight: 1,
                        cursor: 'pointer',
                        verticalAlign: 'middle',
                      }}
                    >
                      i
                    </button>
                  )}
                </td>
                <td style={tdStyle('center')}><Cell row={row} side="A" /></td>
                <td style={tdStyle('center')}><Cell row={row} side="B" /></td>
              </tr>
              {row.info && expanded.has(row.label) && (
                <tr>
                  <td colSpan={3} style={{ padding: '4px 6px 10px', borderBottom: '1px solid rgba(0,255,65,0.07)' }}>
                    <p style={{ fontSize: 9, color: 'rgba(0,255,65,0.45)', lineHeight: 1.5, margin: 0 }}>
                      {row.info}
                    </p>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function thStyle(align: 'left' | 'right' | 'center'): CSSProperties {
  return {
    textAlign: align,
    color: 'rgba(0,255,65,0.35)',
    padding: '8px 6px',
    fontWeight: 'bold',
    letterSpacing: '0.05em',
    fontSize: 9,
    borderBottom: '1px solid rgba(0,255,65,0.12)',
    wordBreak: 'break-word',
  }
}

function tdStyle(align: 'left' | 'right' | 'center'): CSSProperties {
  return {
    textAlign: align,
    padding: '6px',
    borderBottom: '1px solid rgba(0,255,65,0.07)',
    wordBreak: 'break-word',
    lineHeight: 1.3,
  }
}
