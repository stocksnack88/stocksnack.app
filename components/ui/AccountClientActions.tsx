'use client'
import { useState, useEffect } from 'react'

const MONO: React.CSSProperties = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }
const border = 'rgba(0,255,65,0.12)'
const row = 'rgba(0,255,65,0.06)'

export default function AccountClientActions({ userEmail }: { userEmail: string }) {
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
      <div className="rounded mb-6 overflow-hidden" style={{ border: `1px solid ${border}`, animation: 'fadeInUp 300ms ease-out 200ms both' }}>
        <div className="px-5 py-3" style={{ background: 'rgba(0,255,65,0.04)', borderBottom: `1px solid ${border}` }}>
          <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(0,255,65,0.5)', ...MONO }}>PREFERENCES</p>
        </div>
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: row }}>
          <div>
            <p className="text-xs tracking-widest mb-0.5" style={{ color: 'rgba(0,255,65,0.45)', ...MONO }}>SOUND EFFECTS</p>
            <p className="text-[10px]" style={{ color: 'rgba(0,255,65,0.25)', ...MONO }}>UI clicks, chimes and tones</p>
          </div>
          <button
            onClick={toggleSound}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
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
              top: 3,
              left: soundOn ? 22 : 3,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: soundOn ? '#00ff41' : 'rgba(0,255,65,0.3)',
              transition: 'left 0.2s, background 0.2s',
            }} />
          </button>
        </div>
      </div>

      {/* Feedback */}
      <div className="rounded mb-6 overflow-hidden" style={{ border: `1px solid ${border}`, animation: 'fadeInUp 300ms ease-out 250ms both' }}>
        <div className="px-5 py-3" style={{ background: 'rgba(0,255,65,0.04)', borderBottom: `1px solid ${border}` }}>
          <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(0,255,65,0.5)', ...MONO }}>FEEDBACK</p>
        </div>
        <div className="px-5 py-4" style={{ background: row }}>
          {submitted ? (
            <div>
              <p className="text-xs font-bold tracking-widest mb-1" style={{ color: '#00ff41', ...MONO }}>✓ GOT IT</p>
              <p className="text-[10px]" style={{ color: 'rgba(0,255,65,0.4)', ...MONO }}>We&apos;ll email you if we ship a fix based on this.</p>
              <button
                onClick={() => setSubmitted(false)}
                className="mt-3 text-[10px] tracking-widest"
                style={{ background: 'none', border: 'none', color: 'rgba(0,255,65,0.35)', cursor: 'pointer', padding: 0, ...MONO }}
              >
                SEND ANOTHER →
              </button>
            </div>
          ) : (
            <form onSubmit={handleFeedback}>
              <label className="text-[10px] tracking-widest block mb-2" style={{ color: 'rgba(0,255,65,0.4)', ...MONO }}>
                WHAT&apos;S ON YOUR MIND?
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={3}
                placeholder="Bug, missing data, feature request…"
                required
                style={{
                  width: '100%',
                  background: '#0a0a0a',
                  border: '1px solid rgba(0,255,65,0.2)',
                  borderRadius: 4,
                  color: '#00ff41',
                  padding: '8px 10px',
                  fontSize: 12,
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  outline: 'none',
                  ...MONO,
                }}
              />
              {error && <p className="text-[11px] mt-1" style={{ color: '#ef4444', ...MONO }}>{error}</p>}
              <button
                type="submit"
                disabled={submitting || !message.trim()}
                className="mt-3 font-bold text-[10px] tracking-widest px-4 py-2 rounded"
                style={{
                  background: message.trim() ? '#00ff41' : 'rgba(0,255,65,0.1)',
                  color: message.trim() ? '#000' : 'rgba(0,255,65,0.3)',
                  border: 'none',
                  cursor: message.trim() ? 'pointer' : 'default',
                  ...MONO,
                }}
              >
                {submitting ? 'SENDING…' : 'SUBMIT →'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
