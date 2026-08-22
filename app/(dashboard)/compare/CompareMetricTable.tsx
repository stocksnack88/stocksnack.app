import type { CSSProperties } from 'react'
import type { CompareSection, CompareMetricRow } from './compareData'
import { rowWinner } from './compareData'

const GREEN = '#00ff41'
const DIM = 'rgba(0,255,65,0.4)'
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
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
          <thead>
            <tr>
              <th style={thStyle('left')}>METRIC</th>
              <th style={thStyle('right')}>{labelA}</th>
              <th style={{ ...thStyle('center'), width: 24 }}>vs</th>
              <th style={thStyle('right')}>{labelB}</th>
              <th style={thStyle('center')}>WINNER</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, i) => (
              <tr key={`${row.label}-${i}`}>
                <td style={tdStyle('left')}>{row.label}</td>
                <td style={{ ...tdStyle('right'), color: GREEN }}>{displayValue(row, 'A')}</td>
                <td style={{ ...tdStyle('center'), color: DIM, fontSize: 9 }}>vs</td>
                <td style={{ ...tdStyle('right'), color: GREEN }}>{displayValue(row, 'B')}</td>
                <td style={tdStyle('center')}><WinnerBadge row={row} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function thStyle(align: 'left' | 'right' | 'center'): CSSProperties {
  return {
    textAlign: align,
    color: 'rgba(0,255,65,0.35)',
    padding: '8px 10px',
    fontWeight: 'normal',
    letterSpacing: '0.1em',
    fontSize: 9,
    borderBottom: '1px solid rgba(0,255,65,0.12)',
    whiteSpace: 'nowrap',
  }
}

function tdStyle(align: 'left' | 'right' | 'center'): CSSProperties {
  return {
    textAlign: align,
    padding: '7px 10px',
    borderBottom: '1px solid rgba(0,255,65,0.07)',
    whiteSpace: 'nowrap',
  }
}
