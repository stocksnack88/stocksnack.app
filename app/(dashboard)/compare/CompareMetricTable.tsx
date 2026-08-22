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

// Color each value directly (winner green, loser red) instead of a separate
// "A"/"B"/"TIE" column -- the column header is already the real ticker, so
// coloring the number under it says "MSFT wins this row" on its own.
// Pass/fail rows color straight off PASS-vs-FAIL rather than routing
// through rowWinner's A/B framing, since a PASS is good regardless of what
// the other side did.
function sideColor(row: CompareMetricRow, side: 'A' | 'B'): string {
  const value = side === 'A' ? row.valueA : row.valueB
  if (row.direction === 'none') return 'rgba(0,255,65,0.55)'
  if (row.direction === 'pass-fail') {
    if (typeof value !== 'boolean') return 'rgba(0,255,65,0.15)'
    return value ? GREEN : '#ef4444'
  }
  const winner = rowWinner(row)
  if (winner === null) return 'rgba(0,255,65,0.15)'
  if (winner === 'TIE') return '#f59e0b'
  return winner === side ? GREEN : '#ef4444'
}

// Fixed % column widths (no separate WINNER column) -- same approach as the
// Pricing table's <colgroup>, so long metric labels and long values wrap
// onto a second line instead of forcing the table wider than a phone screen.
export function CompareMetricTable({ section, labelA, labelB }: { section: CompareSection; labelA: string; labelB: string }) {
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
            <tr key={`${row.label}-${i}`} style={{ background: i % 2 === 1 ? 'rgba(0,255,65,0.018)' : 'transparent' }}>
              <td style={tdStyle('left')}>{row.label}</td>
              <td style={{ ...tdStyle('center'), color: sideColor(row, 'A'), fontWeight: 'bold' }}>{displayValue(row, 'A')}</td>
              <td style={{ ...tdStyle('center'), color: sideColor(row, 'B'), fontWeight: 'bold' }}>{displayValue(row, 'B')}</td>
            </tr>
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
