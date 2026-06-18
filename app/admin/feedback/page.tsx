export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import type { CSSProperties } from 'react'
import { getCachedUser } from '@/lib/server-auth'
import { supabaseAdmin } from '@/lib/supabase'
import ResolveForm from './ResolveForm'

const ADMIN_EMAIL = 'stocksnack88@gmail.com'

type FeedbackRow = {
  id: number
  user_id: string | null
  email: string | null
  message: string
  page_url: string | null
  status: string
  fix_summary: string | null
  created_at: string
  resolved_at: string | null
}

const MONO: CSSProperties = { fontFamily: "'Courier New', Courier, monospace" }
const DIM   = 'rgba(0,255,136,0.35)'
const FAINT = 'rgba(0,255,136,0.08)'

const S = {
  page:  { background: '#000', color: '#00ff88', minHeight: '100vh', ...MONO, padding: '2rem' } as CSSProperties,
  wrap:  { maxWidth: 1100, margin: '0 auto' } as CSSProperties,
  head:  { fontSize: 10, fontWeight: 'bold', letterSpacing: '0.15em', color: DIM, marginBottom: '0.6rem', borderBottom: `1px solid ${FAINT}`, paddingBottom: '0.35rem' } as CSSProperties,
  th:    { textAlign: 'left' as const, color: DIM, padding: '4px 12px 4px 0', fontWeight: 'normal', letterSpacing: '0.08em', fontSize: 9 },
  td:    { padding: '8px 12px 8px 0', borderBottom: `1px solid ${FAINT}`, verticalAlign: 'top' as const, fontSize: 11 },
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return iso.replace('T', ' ').slice(0, 16) + ' UTC'
}

function statusColor(s: string) {
  if (s === 'resolved') return '#00ff88'
  if (s === 'new')      return '#ffcc00'
  return DIM
}

export default async function AdminFeedbackPage() {
  const user = await getCachedUser()
  if (!user || user.email !== ADMIN_EMAIL) redirect('/screener')

  const { data: rows, error } = await supabaseAdmin
    .from('feedback')
    .select('id, user_id, email, message, page_url, status, fix_summary, created_at, resolved_at')
    .order('created_at', { ascending: false })

  const feedback = (rows ?? []) as FeedbackRow[]

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <p style={{ fontSize: 9, letterSpacing: '0.2em', color: DIM, marginBottom: '0.25rem' }}>ADMIN</p>
        <h1 style={{ fontSize: 18, fontWeight: 'bold', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
          FEEDBACK
        </h1>
        <p style={{ fontSize: 10, color: DIM, marginBottom: '2rem' }}>
          {feedback.length} total · {feedback.filter(r => r.status === 'new').length} unresolved
        </p>

        {error && (
          <p style={{ color: '#ef4444', fontSize: 12, marginBottom: '1rem' }}>
            Error loading feedback: {error.message}
          </p>
        )}

        {feedback.length === 0 ? (
          <p style={{ fontSize: 11, color: DIM }}>No feedback yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={S.th}>ID</th>
                <th style={S.th}>STATUS</th>
                <th style={S.th}>EMAIL</th>
                <th style={S.th}>MESSAGE</th>
                <th style={S.th}>PAGE</th>
                <th style={S.th}>SUBMITTED</th>
                <th style={S.th}>ACTION / FIX</th>
              </tr>
            </thead>
            <tbody>
              {feedback.map(row => (
                <tr key={row.id}>
                  <td style={{ ...S.td, color: DIM }}>{row.id}</td>
                  <td style={{ ...S.td }}>
                    <span style={{ color: statusColor(row.status), letterSpacing: '0.08em' }}>
                      {row.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ ...S.td, color: '#00ff88' }}>{row.email ?? <span style={{ color: DIM }}>—</span>}</td>
                  <td style={{ ...S.td, maxWidth: 320, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {row.message}
                  </td>
                  <td style={{ ...S.td, maxWidth: 200, wordBreak: 'break-all' }}>
                    {row.page_url ? (
                      <span style={{ color: DIM, fontSize: 10 }}>{row.page_url.replace(/^https?:\/\/[^/]+/, '')}</span>
                    ) : (
                      <span style={{ color: DIM }}>—</span>
                    )}
                  </td>
                  <td style={{ ...S.td, color: DIM, whiteSpace: 'nowrap', fontSize: 10 }}>
                    {fmtDate(row.created_at)}
                  </td>
                  <td style={{ ...S.td, minWidth: 200 }}>
                    {row.status === 'resolved' ? (
                      <div>
                        <span style={{ color: '#00ff88', fontSize: 10 }}>✓ RESOLVED</span>
                        {row.fix_summary && (
                          <p style={{ color: DIM, fontSize: 10, marginTop: 4, whiteSpace: 'pre-wrap' }}>
                            {row.fix_summary}
                          </p>
                        )}
                        {row.resolved_at && (
                          <p style={{ color: DIM, fontSize: 9, marginTop: 2 }}>{fmtDate(row.resolved_at)}</p>
                        )}
                      </div>
                    ) : (
                      <ResolveForm id={row.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
