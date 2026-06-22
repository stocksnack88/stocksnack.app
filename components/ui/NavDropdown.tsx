'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useGuidedTour } from './GuidedTour'
import { playClick } from '@/lib/sounds'

const MONO: React.CSSProperties = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }

interface Props {
  userEmail?: string
}

export default function NavDropdown({ userEmail }: Props) {
  const { startTour, menuLabel } = useGuidedTour()
  const [open, setOpen]             = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [message, setMessage]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [error, setError]           = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('click', onOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  useEffect(() => {
    if (!feedbackOpen) return
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') closeFeedback()
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [feedbackOpen])

  function openFeedback() {
    setOpen(false)
    setMessage('')
    setSubmitted(false)
    setError('')
    setFeedbackOpen(true)
  }

  function closeFeedback() {
    setFeedbackOpen(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          email:   userEmail ?? undefined,
          page_url: window.location.href,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Something went wrong')
      }
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#0a0a0a',
    border: '1px solid rgba(0,255,65,0.2)',
    borderRadius: 4,
    color: '#00ff41',
    padding: '10px 12px',
    fontSize: 12,
    ...MONO,
    outline: 'none',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    letterSpacing: '0.12em',
    color: 'rgba(0,255,65,0.5)',
    display: 'block',
    marginBottom: 6,
    ...MONO,
  }

  return (
    <>
      <div ref={ref} className="relative flex items-center">
        {/* trigger */}
        <button
          onClick={() => { playClick(); setOpen(o => !o) }}
          aria-label="Open menu"
          aria-expanded={open}
          aria-haspopup="true"
          className="self-center mt-1 tracking-widest transition-colors cursor-pointer select-none py-3 px-1"
          style={{
            background: 'none',
            border: 'none',
            color: open ? '#00ff41' : 'rgba(0,255,65,0.5)',
            ...MONO,
          }}
        >
          {open ? '✕' : '≡'}
        </button>

        {/* dropdown panel */}
        {open && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              background: '#000',
              border: '1px solid rgba(0,255,65,0.2)',
              borderRadius: 4,
              minWidth: 200,
              zIndex: 200,
              padding: '4px 0',
              boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
            }}
          >
            <Link
              href="/market"
              role="menuitem"
              className="flex items-center justify-between px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors"
              style={{ ...MONO, borderBottom: '1px solid rgba(0,255,65,0.08)' }}
            >
              MARKET OVERVIEW <span style={{ fontSize: 10 }}>🔒</span>
            </Link>
            <Link
              href="/compare"
              role="menuitem"
              className="flex items-center justify-between px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors"
              style={{ ...MONO, borderBottom: '1px solid rgba(0,255,65,0.08)' }}
            >
              COMPARE <span style={{ fontSize: 10 }}>🔒</span>
            </Link>
            <Link
              href="/account"
              role="menuitem"
              className="block px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors"
              style={{ ...MONO, borderBottom: '1px solid rgba(0,255,65,0.08)' }}
            >
              ACCOUNT
            </Link>
            <button
              role="menuitem"
              onClick={() => { setOpen(false); startTour() }}
              className="block w-full text-left px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors cursor-pointer"
              style={{ background: 'none', border: 'none', borderBottom: '1px solid rgba(0,255,65,0.08)', ...MONO }}
            >
              {menuLabel}
            </button>
            <button
              role="menuitem"
              onClick={openFeedback}
              className="block w-full text-left px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors cursor-pointer"
              style={{ background: 'none', border: 'none', ...MONO }}
            >
              FEEDBACK
            </button>
          </div>
        )}
      </div>

      {/* Feedback modal — portalled to document.body so it escapes the nav's z-50 stacking context */}
      {feedbackOpen && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeFeedback() }}
        >
          <div
            style={{
              background: '#000',
              border: '1px solid rgba(0,255,65,0.3)',
              borderRadius: 6,
              width: '100%',
              maxWidth: 440,
              padding: '28px 28px 24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
            }}
          >
            {/* header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ color: '#00ff41', fontSize: 11, letterSpacing: '0.2em', fontWeight: 'bold', ...MONO }}>
                FEEDBACK
              </span>
              <button
                onClick={closeFeedback}
                style={{ background: 'none', border: 'none', color: 'rgba(0,255,65,0.4)', cursor: 'pointer', fontSize: 16, lineHeight: 1, ...MONO }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {submitted ? (
              /* success state */
              <div>
                <p style={{ color: '#00ff41', fontSize: 14, marginBottom: 8, ...MONO }}>✓ Got it.</p>
                <p style={{ color: 'rgba(0,255,65,0.55)', fontSize: 12, lineHeight: 1.7, marginBottom: 24, ...MONO }}>
                  We&apos;ll email you if we ship a fix based on this.
                </p>
                <button
                  onClick={closeFeedback}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(0,255,65,0.3)',
                    borderRadius: 4,
                    color: 'rgba(0,255,65,0.7)',
                    padding: '8px 20px',
                    fontSize: 11,
                    letterSpacing: '0.1em',
                    cursor: 'pointer',
                    ...MONO,
                  }}
                >
                  CLOSE
                </button>
              </div>
            ) : !userEmail ? (
              /* logged-out gate */
              <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                <p style={{ color: 'rgba(0,255,65,0.55)', fontSize: 12, lineHeight: 1.7, marginBottom: 20, ...MONO }}>
                  Sign up to submit feedback.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={closeFeedback}
                    style={{
                      background: 'none',
                      border: '1px solid rgba(0,255,65,0.15)',
                      borderRadius: 4,
                      color: 'rgba(0,255,65,0.4)',
                      padding: '8px 16px',
                      fontSize: 11,
                      letterSpacing: '0.1em',
                      cursor: 'pointer',
                      ...MONO,
                    }}
                  >
                    CANCEL
                  </button>
                  <Link
                    href="/signup"
                    onClick={closeFeedback}
                    style={{
                      background: '#00ff41',
                      border: 'none',
                      borderRadius: 4,
                      color: '#000',
                      padding: '8px 20px',
                      fontSize: 11,
                      fontWeight: 'bold',
                      letterSpacing: '0.1em',
                      textDecoration: 'none',
                      display: 'inline-block',
                      ...MONO,
                    }}
                  >
                    SIGN UP →
                  </Link>
                </div>
              </div>
            ) : (
              /* form — logged-in users only */
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>WHAT&apos;S ON YOUR MIND?</label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={4}
                    placeholder="Bug, missing data, feature request…"
                    required
                    style={inputStyle}
                  />
                </div>

                {error && (
                  <p style={{ color: '#ef4444', fontSize: 11, marginBottom: 12, ...MONO }}>{error}</p>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={closeFeedback}
                    style={{
                      background: 'none',
                      border: '1px solid rgba(0,255,65,0.15)',
                      borderRadius: 4,
                      color: 'rgba(0,255,65,0.4)',
                      padding: '8px 16px',
                      fontSize: 11,
                      letterSpacing: '0.1em',
                      cursor: 'pointer',
                      ...MONO,
                    }}
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !message.trim()}
                    style={{
                      background: message.trim() ? '#00ff41' : 'rgba(0,255,65,0.15)',
                      border: 'none',
                      borderRadius: 4,
                      color: message.trim() ? '#000' : 'rgba(0,255,65,0.3)',
                      padding: '8px 20px',
                      fontSize: 11,
                      fontWeight: 'bold',
                      letterSpacing: '0.1em',
                      cursor: message.trim() ? 'pointer' : 'default',
                      ...MONO,
                    }}
                  >
                    {submitting ? 'SENDING…' : 'SUBMIT →'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
