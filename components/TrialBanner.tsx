'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import TrialExpiredModal from './TrialExpiredModal'

const TRIAL_DURATION_MS = 5 * 60 * 1000

function fmtTime(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function TrialBanner() {
  const [trialStartedAt, setTrialStartedAt] = useState<string | null>(null)
  const [timeLeftMs, setTimeLeftMs] = useState<number>(TRIAL_DURATION_MS)
  const [expired, setExpired] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [visible, setVisible] = useState(false)
  const expiredRef = useRef(false)

  const markExpired = useCallback(() => {
    if (expiredRef.current) return
    expiredRef.current = true
    setExpired(true)
    setShowModal(true)
    fetch('/api/trial/expire', { method: 'POST' }).catch(() => {})
  }, [])

  // Fetch status on mount
  useEffect(() => {
    fetch('/api/trial/status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || data.isPro || data.trialUsed || !data.trialStartedAt) return
        setTrialStartedAt(data.trialStartedAt)
        setVisible(true)
        const elapsed = Date.now() - new Date(data.trialStartedAt).getTime()
        if (elapsed >= TRIAL_DURATION_MS) markExpired()
      })
      .catch(() => {})
  }, [markExpired])

  // Poll every 30s for status refresh
  useEffect(() => {
    const id = setInterval(() => {
      if (expiredRef.current) return
      fetch('/api/trial/status')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return
          if (data.isPro || data.trialUsed) { setVisible(false); return }
          if (data.trialStartedAt && !trialStartedAt) {
            setTrialStartedAt(data.trialStartedAt)
            setVisible(true)
          }
        })
        .catch(() => {})
    }, 30000)
    return () => clearInterval(id)
  }, [trialStartedAt])

  // Listen for trial:started event from TrialStarter
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ trialStartedAt: string }>).detail
      setTrialStartedAt(detail.trialStartedAt)
      setVisible(true)
    }
    window.addEventListener('trial:started', handler)
    return () => window.removeEventListener('trial:started', handler)
  }, [])

  // Countdown tick
  useEffect(() => {
    if (!trialStartedAt || expired) return
    const tick = () => {
      const elapsed = Date.now() - new Date(trialStartedAt).getTime()
      const left = TRIAL_DURATION_MS - elapsed
      if (left <= 0) {
        setTimeLeftMs(0)
        markExpired()
      } else {
        setTimeLeftMs(left)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [trialStartedAt, expired, markExpired])

  if (!visible) return null

  return (
    <>
      {showModal && <TrialExpiredModal onClose={() => setShowModal(false)} />}

      {!expired && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-4 px-4 py-3"
          style={{
            background: 'rgba(0,8,0,0.95)',
            borderTop: '1px solid rgba(0,255,65,0.2)',
            backdropFilter: 'blur(8px)',
            fontFamily: "var(--font-geist-mono), 'Courier New', monospace",
          }}
        >
          <span className="text-xs tracking-widest" style={{ color: 'rgba(0,255,65,0.45)' }}>
            FREE TRIAL
          </span>
          <span
            className="text-sm font-bold tracking-widest tabular-nums"
            style={{ color: timeLeftMs < 60000 ? '#f87171' : '#00ff41' }}
          >
            {fmtTime(timeLeftMs)} REMAINING
          </span>
          <a
            href="/pricing"
            className="ml-2 text-xs font-bold tracking-widest px-3 py-1.5 rounded transition-opacity hover:opacity-80"
            style={{ background: '#00ff41', color: '#000' }}
          >
            UPGRADE →
          </a>
        </div>
      )}
    </>
  )
}
