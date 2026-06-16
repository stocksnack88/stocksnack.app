export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCachedUser } from '@/lib/server-auth'
import type { CSSProperties } from 'react'
import CompareInputs from './CompareInputs'

const INTERNAL_EMAILS = ['mrepsiloned@gmail.com', 'stocksnack88@gmail.com']

const GREEN  = '#00ff41'
const DIM    = 'rgba(0,255,65,0.4)'
const FAINT  = 'rgba(0,255,65,0.1)'
const MONO: CSSProperties = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }

const SECTIONS = [
  'OVERVIEW',
  'LAYER 1 — PRICE PROJECTION',
  'LAYER 2 — GROWTH QUALITY',
  'LAYER 3 — FINANCIAL HEALTH',
  'LAYER 4 — FINAL SCORE',
  'MARKET COMPARISON',
]

function PlaceholderCard({ title }: { title: string }) {
  return (
    <div style={{
      border: '1px solid rgba(0,255,65,0.2)',
      background: 'rgba(0,255,65,0.02)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      <div style={{
        background: '#001a00',
        borderBottom: `1px solid ${FAINT}`,
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <p style={{
          fontSize: 12, fontWeight: 'bold', letterSpacing: '0.1em',
          color: GREEN, margin: 0, ...MONO,
        }}>
          {title}
        </p>
        <span style={{ fontSize: 9, color: 'rgba(0,255,65,0.2)', letterSpacing: '0.1em', ...MONO }}>
          COMING SOON
        </span>
      </div>
      <div style={{
        padding: '2rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 80,
      }}>
        <p style={{ fontSize: 9, color: 'rgba(0,255,65,0.15)', letterSpacing: '0.15em', ...MONO, margin: 0 }}>
          — DATA NOT YET POPULATED —
        </p>
      </div>
    </div>
  )
}

export default async function ComparePage() {
  const user = await getCachedUser()
  if (!user || !INTERNAL_EMAILS.includes(user.email ?? '')) redirect('/screener')

  return (
    <div style={{ background: '#000', color: GREEN, minHeight: '100vh', ...MONO }}>
      <div style={{ maxWidth: 896, margin: '0 auto', padding: '0 1.5rem 4rem' }}>

        {/* hero */}
        <div style={{ borderBottom: `1px solid ${FAINT}`, padding: '2.5rem 0 2rem' }}>
          <p style={{ fontSize: 9, color: DIM, letterSpacing: '0.25em', margin: '0 0 10px' }}>
            STOCKSNACK · STOCK COMPARE
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 'bold', letterSpacing: '0.05em', margin: 0 }}>
            COMPARE
          </h1>
          <p style={{ fontSize: 11, color: DIM, margin: '6px 0 0', letterSpacing: '0.08em' }}>
            Side-by-side analysis — stock vs stock, vs S&P 500, or vs industry average.
          </p>
        </div>

        {/* input card */}
        <div style={{ marginTop: '2rem' }}>
          <div style={{
            border: '1px solid rgba(0,255,65,0.2)',
            background: 'rgba(0,255,65,0.02)',
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            <div style={{
              background: '#001a00',
              borderBottom: `1px solid ${FAINT}`,
              padding: '1rem 1.25rem',
            }}>
              <p style={{ fontSize: 12, fontWeight: 'bold', letterSpacing: '0.1em', color: GREEN, margin: 0 }}>
                SELECT STOCKS TO COMPARE
              </p>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <CompareInputs />
            </div>
          </div>
        </div>

        {/* placeholder sections */}
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {SECTIONS.map(title => (
            <PlaceholderCard key={title} title={title} />
          ))}
        </div>

        {/* footer */}
        <p style={{
          marginTop: '2.5rem', paddingTop: '1rem',
          borderTop: `1px solid ${FAINT}`,
          fontSize: 9, color: 'rgba(0,255,65,0.2)',
          textAlign: 'center', letterSpacing: '0.15em',
          margin: '2.5rem 0 0',
        }}>
          STOCKSNACK · COMPARE · INTERNAL
        </p>

      </div>
    </div>
  )
}
