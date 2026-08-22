'use client'
import { useState, useEffect } from 'react'
import AccordionRow from '@/components/ui/AccordionRow'
import { InstallIcon, CardIcon, SoundIcon, FeedbackIcon, MailIcon } from '@/components/ui/AccountIcons'
import CancelSubscriptionButton from '@/components/ui/CancelSubscriptionButton'
import Link from 'next/link'

const MONO: React.CSSProperties = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }
const DIM = 'rgba(0,255,65,0.45)'

type FeedbackItem = {
  id: number
  message: string
  status: string
  fix_summary: string | null
  created_at: string
  resolved_at: string | null
  image_url: string | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function SoundToggle() {
  const [soundOn, setSoundOn] = useState(true)

  useEffect(() => {
    setSoundOn(localStorage.getItem('ss_sound') !== '0')
  }, [])

  function toggle() {
    const next = !soundOn
    setSoundOn(next)
    localStorage.setItem('ss_sound', next ? '1' : '0')
  }

  return (
    <button
      onClick={toggle}
      style={{
        width: 38, height: 20, borderRadius: 10,
        border: `1px solid ${soundOn ? '#00ff41' : 'rgba(0,255,65,0.2)'}`,
        background: soundOn ? 'rgba(0,255,65,0.15)' : 'rgba(0,255,65,0.03)',
        position: 'relative', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
      }}
      aria-label={soundOn ? 'Mute sounds' : 'Unmute sounds'}
    >
      <span style={{
        position: 'absolute', top: 2, left: soundOn ? 20 : 2, width: 14, height: 14,
        borderRadius: '50%', background: soundOn ? '#00ff41' : 'rgba(0,255,65,0.3)',
        transition: 'left 0.2s, background 0.2s',
      }} />
    </button>
  )
}

export default function AccountRows({
  email, isPro, periodEndStr, cancelAtPeriodEnd, userEmail,
}: {
  email: string
  isPro: boolean
  periodEndStr: string | null
  cancelAtPeriodEnd: boolean
  userEmail: string
}) {
  const [installed, setInstalled] = useState(false)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<FeedbackItem[]>([])
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  useEffect(() => {
    setInstalled(
      window.matchMedia('(display-mode: standalone)').matches
      || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
    )
  }, [])

  async function loadHistory() {
    try {
      const res = await fetch('/api/feedback/mine')
      const d = await res.json().catch(() => ({}))
      if (Array.isArray(d.feedback)) setHistory(d.feedback)
    } catch {
      // non-fatal -- history is a nice-to-have, form still works without it
    }
  }

  useEffect(() => { loadHistory() }, [])

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    if (!file) {
      setImage(null)
      setImagePreview(null)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image is too large (max 5MB)')
      e.target.value = ''
      return
    }
    setError('')
    setImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImage(null)
    setImagePreview(null)
  }

  async function handleFeedback(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const formData = new FormData()
      formData.set('message', message.trim())
      formData.set('email', userEmail)
      formData.set('page_url', window.location.href)
      if (image) formData.set('image', image)

      const res = await fetch('/api/feedback', { method: 'POST', body: formData })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Something went wrong')
      }
      setSubmitted(true)
      setMessage('')
      clearImage()
      loadHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ ...MONO, animation: 'fadeInUp 300ms ease-out 50ms both' }}>
      <AccordionRow icon={<MailIcon />} label="EMAIL" right={{ kind: 'value', text: email }} />

      <AccordionRow
        icon={<CardIcon />}
        label="PLAN"
        right={{ kind: 'pill', text: isPro ? 'PRO' : 'FREE', active: isPro }}
      >
        {isPro ? (
          cancelAtPeriodEnd && periodEndStr ? (
            <div
              className="rounded px-3 py-2.5 text-xs leading-relaxed"
              style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#f87171' }}
            >
              Scheduled to cancel on <strong>{periodEndStr}</strong>. You&apos;ll keep Pro access until then.
            </div>
          ) : (
            <>
              {periodEndStr && (
                <div className="flex justify-between text-xs mb-3">
                  <span style={{ color: DIM }}>NEXT BILLING</span>
                  <span style={{ color: 'rgba(0,255,65,0.85)' }}>{periodEndStr}</span>
                </div>
              )}
              <CancelSubscriptionButton periodEnd={periodEndStr ?? ''} />
            </>
          )
        ) : (
          <>
            <Link
              href="/api/subscribe"
              className="inline-block font-bold text-xs tracking-widest py-2 px-5 rounded transition-colors"
              style={{ background: '#00ff41', color: '#000' }}
            >
              UPGRADE TO PRO &rarr;
            </Link>
            <p className="mt-2 text-[10px]" style={{ color: 'rgba(0,255,65,0.3)' }}>
              $20/mo &middot; all 20 stocks &middot; full detail pages
            </p>
          </>
        )}
        <Link
          href="/pricing"
          className="inline-block mt-3 text-[10px] tracking-widest underline"
          style={{ color: 'rgba(0,255,65,0.35)' }}
        >
          VIEW PLAN &rarr;
        </Link>
      </AccordionRow>

      <AccordionRow
        icon={<SoundIcon />}
        label="SOUND EFFECTS"
        right={{ kind: 'custom', node: <SoundToggle /> }}
      />

      <AccordionRow icon={<InstallIcon />} label="ADD TO HOME SCREEN" right={{ kind: 'chevron' }}>
        {installed && (
          <p className="text-[10px] mb-2" style={{ color: '#00ff41' }}>&#10003; Already installed on this device.</p>
        )}
        <p className="text-[10px] leading-relaxed mb-2.5" style={{ color: 'rgba(0,255,65,0.45)' }}>
          One tap from your home screen, no browser bar, stays in sync automatically.
        </p>
        <div className="flex justify-between items-baseline py-1.5" style={{ borderTop: '1px solid rgba(0,255,65,0.08)' }}>
          <span className="text-[10px] flex-shrink-0" style={{ color: DIM }}>IPHONE</span>
          <span className="text-xs text-right">Share icon &rarr; <strong>Add to Home Screen</strong></span>
        </div>
        <div className="flex justify-between items-baseline py-1.5" style={{ borderTop: '1px solid rgba(0,255,65,0.08)' }}>
          <span className="text-[10px] flex-shrink-0" style={{ color: DIM }}>ANDROID</span>
          <span className="text-xs text-right">&#8942; menu &rarr; <strong>Install app</strong></span>
        </div>
      </AccordionRow>

      <AccordionRow icon={<FeedbackIcon />} label="FEEDBACK" right={{ kind: 'chevron' }}>
        <form onSubmit={handleFeedback} className="mb-4">
          {submitted && (
            <div className="mb-2.5">
              <p className="text-xs font-bold tracking-widest mb-1" style={{ color: '#00ff41' }}>&#10003; GOT IT</p>
              <p className="text-[10px]" style={{ color: 'rgba(0,255,65,0.4)' }}>We&apos;ll email you if we ship a fix based on this. Send another below any time.</p>
            </div>
          )}
          {/* text-base (16px) is deliberate, not a typo -- iOS Safari
              auto-zooms the viewport on focus for any field under 16px */}
          <textarea
            value={message}
            onChange={e => { setMessage(e.target.value); setSubmitted(false) }}
            rows={5}
            placeholder="Bug, missing data, feature request…"
            required
            className="text-base md:text-xs"
            style={{
              width: '100%', background: '#0a0a0a', border: '1px solid rgba(0,255,65,0.15)',
              borderRadius: 4, color: '#00ff41', padding: '10px', lineHeight: 1.5,
              resize: 'none', boxSizing: 'border-box', outline: 'none',
            }}
          />
          {error && <p className="text-[11px] mt-1" style={{ color: '#ef4444' }}>{error}</p>}

          {imagePreview ? (
            <div className="mt-1.5 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not a remote asset */}
              <img
                src={imagePreview}
                alt="Attachment preview"
                style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(0,255,65,0.25)' }}
              />
              <button
                type="button"
                onClick={clearImage}
                className="text-[10px] tracking-widest"
                style={{ background: 'none', border: 'none', color: 'rgba(0,255,65,0.4)', cursor: 'pointer', padding: 0 }}
              >
                REMOVE
              </button>
            </div>
          ) : (
            <label
              className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] tracking-widest"
              style={{ color: 'rgba(0,255,65,0.4)', cursor: 'pointer' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21.44 11.05l-9.19 9.19a5 5 0 01-7.07-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              ATTACH IMAGE
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImagePick} style={{ display: 'none' }} />
            </label>
          )}

          <button
            type="submit"
            disabled={submitting || !message.trim()}
            className="mt-1.5 block font-bold text-[10px] tracking-widest px-4 py-1.5 rounded"
            style={{
              background: message.trim() ? '#00ff41' : 'rgba(0,255,65,0.1)',
              color: message.trim() ? '#000' : 'rgba(0,255,65,0.3)',
              border: 'none', cursor: message.trim() ? 'pointer' : 'default',
            }}
          >
            {submitting ? 'SENDING…' : 'SUBMIT →'}
          </button>
        </form>

        {history.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(0,255,65,0.08)', paddingTop: 10 }}>
            <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: DIM }}>YOUR PAST FEEDBACK</p>
            <div className="flex flex-col gap-2.5">
              {history.map(item => (
                <div key={item.id}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] leading-snug" style={{ color: 'rgba(0,255,65,0.7)' }}>{item.message}</p>
                    <span
                      className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded flex-shrink-0"
                      style={
                        item.status === 'resolved'
                          ? { background: 'rgba(0,255,65,0.12)', color: '#00ff41' }
                          : { background: 'rgba(255,204,0,0.12)', color: '#ffcc00' }
                      }
                    >
                      {item.status === 'resolved' ? 'FIXED' : 'OPEN'}
                    </span>
                  </div>
                  <p className="text-[9px] mt-0.5" style={{ color: 'rgba(0,255,65,0.25)' }}>{fmtDate(item.created_at)}</p>
                  {item.image_url && (
                    <a href={item.image_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage public URL, not a static app asset */}
                      <img
                        src={item.image_url}
                        alt="Attached screenshot"
                        style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(0,255,65,0.15)' }}
                      />
                    </a>
                  )}
                  {item.status === 'resolved' && item.fix_summary && (
                    <p className="text-[10px] mt-1 pl-2" style={{ color: 'rgba(0,255,65,0.5)', borderLeft: '2px solid rgba(0,255,65,0.2)' }}>
                      {item.fix_summary}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </AccordionRow>
    </div>
  )
}
