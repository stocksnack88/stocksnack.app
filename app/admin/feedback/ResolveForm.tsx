'use client'
import { useState } from 'react'

const MONO: React.CSSProperties = { fontFamily: "'Courier New', Courier, monospace" }

export default function ResolveForm({ id }: { id: number }) {
  const [summary, setSummary]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!summary.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fix_summary: summary.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Request failed')
      }
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return <span style={{ color: '#00ff41', fontSize: 10, ...MONO }}>✓ RESOLVED</span>
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240 }}>
      <textarea
        value={summary}
        onChange={e => setSummary(e.target.value)}
        rows={2}
        placeholder="What was fixed…"
        required
        style={{
          background: '#0a0a0a',
          border: '1px solid rgba(0,255,136,0.2)',
          borderRadius: 3,
          color: '#00ff88',
          padding: '6px 8px',
          fontSize: 11,
          resize: 'vertical',
          ...MONO,
        }}
      />
      {error && <span style={{ color: '#ef4444', fontSize: 10, ...MONO }}>{error}</span>}
      <button
        type="submit"
        disabled={loading || !summary.trim()}
        style={{
          background: summary.trim() ? '#00ff88' : 'rgba(0,255,136,0.1)',
          border: 'none',
          borderRadius: 3,
          color: summary.trim() ? '#000' : 'rgba(0,255,136,0.3)',
          padding: '5px 12px',
          fontSize: 10,
          fontWeight: 'bold',
          letterSpacing: '0.1em',
          cursor: summary.trim() ? 'pointer' : 'default',
          alignSelf: 'flex-start',
          ...MONO,
        }}
      >
        {loading ? 'SAVING…' : 'MARK RESOLVED →'}
      </button>
    </form>
  )
}
