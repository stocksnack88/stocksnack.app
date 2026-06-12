'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import TrialExpiredModal from './TrialExpiredModal'

const TRIAL_MS = 5 * 60 * 1000
const EXTENSION_MS = 15 * 60 * 1000
const mono = "var(--font-geist-mono), 'Courier New', monospace"

function fmtTime(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

type Phase = 'idle' | 'trial' | 'expired' | 'extension' | 'done'

export default function TrialBanner() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [trialStartedAt, setTrialStartedAt] = useState<string | null>(null)
  const [trialExtensionStartedAt, setTrialExtensionStartedAt] = useState<string | null>(null)
  const [hasPhone, setHasPhone] = useState(false)
  const [timeLeftMs, setTimeLeftMs] = useState(TRIAL_MS)
  const [showExpiredModal, setShowExpiredModal] = useState(false)
  const expireCalledRef = useRef(false)

  const handleExpiry = useCallback(() => {
    if (expireCalledRef.current) return
    expireCalledRef.current = true
    setPhase('expired')
    setShowExpiredModal(true)
    fetch('/api/trial/expire', { method: 'POST' }).catch(() => {})
  }, [])

  const handleExtended = useCallback((_extensionAt: string) => {
    // Full reload: re-renders server component (shows all 500 stocks) and remounts
    // TrialBanner cleanly so the initial fetch detects the extension and starts
    // the countdown. router.refresh() can silently reset client state mid-render.
    window.location.reload()
  }, [])

  // Initial fetch
  useEffect(() => {
    fetch('/api/trial/status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || data.isPro) return
        setHasPhone(!!data.hasPhone)

        // Extension already used — show countdown or done
        if (data.trialExtensionStartedAt) {
          setTrialExtensionStartedAt(data.trialExtensionStartedAt)
          const elapsed = Date.now() - new Date(data.trialExtensionStartedAt).getTime()
          setPhase(elapsed >= EXTENSION_MS ? 'done' : 'extension')
          return
        }
        // Trial expired, no extension yet — show extension banner.
        // Requires trialStartedAt to be set: guests get trialUsed=true but
        // trialStartedAt=null, so this guard prevents showing to guests.
        if (data.trialUsed && data.trialStartedAt) {
          setPhase('expired')
          return
        }
        // Trial in progress — show countdown
        if (data.trialStartedAt) {
          setTrialStartedAt(data.trialStartedAt)
          const elapsed = Date.now() - new Date(data.trialStartedAt).getTime()
          if (elapsed >= TRIAL_MS) { handleExpiry() } else { setPhase('trial') }
        }
      })
      .catch(() => {})
  }, [handleExpiry])

  // trial:started event from TrialStarter
  useEffect(() => {
    const handler = (e: Event) => {
      const { trialStartedAt: at } = (e as CustomEvent<{ trialStartedAt: string }>).detail
      setTrialStartedAt(at)
      setPhase('trial')
    }
    window.addEventListener('trial:started', handler)
    return () => window.removeEventListener('trial:started', handler)
  }, [])

  // Countdown tick
  useEffect(() => {
    if (phase === 'trial' && trialStartedAt) {
      const tick = () => {
        const left = TRIAL_MS - (Date.now() - new Date(trialStartedAt).getTime())
        if (left <= 0) { setTimeLeftMs(0); handleExpiry() } else { setTimeLeftMs(left) }
      }
      tick()
      const id = setInterval(tick, 1000)
      return () => clearInterval(id)
    }
    if (phase === 'extension' && trialExtensionStartedAt) {
      const tick = () => {
        const left = EXTENSION_MS - (Date.now() - new Date(trialExtensionStartedAt).getTime())
        if (left <= 0) { setTimeLeftMs(0); setPhase('done') } else { setTimeLeftMs(left) }
      }
      tick()
      const id = setInterval(tick, 1000)
      return () => clearInterval(id)
    }
  }, [phase, trialStartedAt, trialExtensionStartedAt, handleExpiry])

  async function extendDirect() {
    try {
      const r = await fetch('/api/trial/extend', { method: 'POST' })
      const data = await r.json()
      if (r.ok) handleExtended(data.trialExtensionStartedAt)
    } catch {}
  }

  if (phase === 'idle' || phase === 'done') return null

  return (
    <>
      {showExpiredModal && (
        <TrialExpiredModal
          hasPhone={hasPhone}
          onExtended={handleExtended}
          onClose={() => setShowExpiredModal(false)}
        />
      )}

      {/* Countdown bar — trial or extension */}
      {(phase === 'trial' || phase === 'extension') && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-4 px-4 py-3"
          style={{ background: 'rgba(0,8,0,0.95)', borderTop: '1px solid rgba(0,255,65,0.2)', backdropFilter: 'blur(8px)', fontFamily: mono }}
        >
          <span className="text-xs tracking-widest" style={{ color: 'rgba(0,255,65,0.45)' }}>
            {phase === 'extension' ? 'BONUS TIME' : 'FREE TRIAL'}
          </span>
          <span className="text-sm font-bold tracking-widest tabular-nums" style={{ color: timeLeftMs < 60000 ? '#f87171' : '#00ff41' }}>
            {fmtTime(timeLeftMs)} REMAINING
          </span>
          <a href="/pricing" className="ml-2 text-xs font-bold tracking-widest px-3 py-1.5 rounded transition-opacity hover:opacity-80" style={{ background: '#00ff41', color: '#000' }}>
            UPGRADE →
          </a>
        </div>
      )}

      {/* EXTENSION BANNER — logged-in, trial_used=true, no extension yet.
          phase='expired' is only set when trialStartedAt is set (real user),
          so guests can never reach this state. */}
      {phase === 'expired' && !showExpiredModal && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[250] flex items-center justify-center px-4 py-3 cursor-pointer select-none"
          style={{ background: 'rgba(0,8,0,0.97)', borderTop: '1px solid rgba(0,255,65,0.2)', backdropFilter: 'blur(8px)', fontFamily: mono }}
          onClick={() => hasPhone ? extendDirect() : router.push('/verify-phone')}
        >
          <span className="text-sm font-bold tracking-widest" style={{ color: '#00ff41' }}>
            GET 15 MORE MINUTES FREE →
          </span>
        </div>
      )}
    </>
  )
}
