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

function WinnerBadge({ row }: { row: CompareMetricRow }) {
  const winner = rowWinner(row)
  if (winner === null) return <span style={{ color: 'rgba(0,255,65,0.15)' }}>—</span>
  if (winner === 'TIE') return <span style={{ color: 'rgba(251,191,36,0.6)', fontWeight: 'bold' }}>TIE</span>
  return (
    <span style={{ color: GREEN, fontWeight: 'bold' }}>
      {winner === 'A' ? 'A' : 'B'}
    </span>
  )
}

// Fixed % column widths (no "vs" spacer column, no horizontal scroll) --
// same approach as the Pricing table's <colgroup>, so long metric labels
// and long values (health-check names, "INDUSTRY AVG") wrap onto a second
// line instead of forcing the table wider than a phone screen.
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
          <col style={{ width: '38%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '14%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={thStyle('left')} />
            <th style={thStyle('center')}>{labelA}</th>
            <th style={thStyle('center')}>{labelB}</th>
            <th style={thStyle('center')}>WIN</th>
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, i) => (
            <tr key={`${row.label}-${i}`} style={{ background: i % 2 === 1 ? 'rgba(0,255,65,0.018)' : 'transparent' }}>
              <td style={tdStyle('left')}>{row.label}</td>
              <td style={{ ...tdStyle('center'), color: GREEN }}>{displayValue(row, 'A')}</td>
              <td style={{ ...tdStyle('center'), color: GREEN }}>{displayValue(row, 'B')}</td>
              <td style={tdStyle('center')}><WinnerBadge row={row} /></td>
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
