'use client'
import { useState, useEffect } from 'react'

const MONO: React.CSSProperties = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }

export default function AccountClientActions({
  userEmail, sectionLabel, rowStyle, dim,
}: {
  userEmail: string
  sectionLabel: React.CSSProperties
  rowStyle: React.CSSProperties
  dim: string
}) {
  const [soundOn, setSoundOn] = useState(true)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSoundOn(localStorage.getItem('ss_sound') !== '0')
  }, [])

  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    localStorage.setItem('ss_sound', next ? '1' : '0')
  }

  const handleFeedback = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim(), email: userEmail, page_url: window.location.href }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Something went wrong')
      }
      setSubmitted(true)
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Sound */}
      <p style={sectionLabel}>PREFERENCES</p>
      <div style={{ ...rowStyle, ...MONO }}>
        <span style={{ color: dim }}>SOUND EFFECTS</span>
        <button
          onClick={toggleSound}
          style={{
            width: 38,
            height: 20,
            borderRadius: 10,
            border: `1px solid ${soundOn ? '#00ff41' : 'rgba(0,255,65,0.2)'}`,
            background: soundOn ? 'rgba(0,255,65,0.15)' : 'rgba(0,255,65,0.03)',
            position: 'relative',
            cursor: 'pointer',
            transition: 'all 0.2s',
            flexShrink: 0,
          }}
          aria-label={soundOn ? 'Mute sounds' : 'Unmute sounds'}
        >
          <span style={{
            position: 'absolute',
            top: 2,
            left: soundOn ? 20 : 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: soundOn ? '#00ff41' : 'rgba(0,255,65,0.3)',
            transition: 'left 0.2s, background 0.2s',
          }} />
        </button>
      </div>

      {/* Feedback -- not a single row (needs a textarea), but keeps the
          same section-label + no-card-chrome treatment as everything else. */}
      <p style={sectionLabel}>FEEDBACK</p>
      <div style={{ paddingTop: 4, paddingBottom: 10, ...MONO }}>
        {submitted ? (
          <div>
            <p className="text-xs font-bold tracking-widest mb-1" style={{ color: '#00ff41' }}>✓ GOT IT</p>
            <p className="text-[10px]" style={{ color: 'rgba(0,255,65,0.4)' }}>We&apos;ll email you if we ship a fix based on this.</p>
            <button
              onClick={() => setSubmitted(false)}
              className="mt-3 text-[10px] tracking-widest"
              style={{ background: 'none', border: 'none', color: 'rgba(0,255,65,0.35)', cursor: 'pointer', padding: 0 }}
            >
              SEND ANOTHER →
            </button>
          </div>
        ) : (
          <form onSubmit={handleFeedback}>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={2}
              placeholder="Bug, missing data, feature request…"
              required
              style={{
                width: '100%',
                background: '#0a0a0a',
                border: '1px solid rgba(0,255,65,0.15)',
                borderRadius: 4,
                color: '#00ff41',
                padding: '8px 10px',
                fontSize: 11,
                resize: 'none',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            {error && <p className="text-[11px] mt-1" style={{ color: '#ef4444' }}>{error}</p>}
            <button
              type="submit"
              disabled={submitting || !message.trim()}
              className="mt-1.5 font-bold text-[10px] tracking-widest px-4 py-1.5 rounded"
              style={{
                background: message.trim() ? '#00ff41' : 'rgba(0,255,65,0.1)',
                color: message.trim() ? '#000' : 'rgba(0,255,65,0.3)',
                border: 'none',
                cursor: message.trim() ? 'pointer' : 'default',
              }}
            >
              {submitting ? 'SENDING…' : 'SUBMIT →'}
            </button>
          </form>
        )}
      </div>
    </>
  )
}
