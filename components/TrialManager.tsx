'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import TrialExpiredModal from './TrialExpiredModal'

const TRIAL_MS = 5 * 60 * 1000
const EXTENSION_MS = 15 * 60 * 1000
const mono = "var(--font-geist-mono), 'Courier New', monospace"

type Phase = 'idle' | 'trial' | 'expired' | 'extension' | 'done'

function fmtTime(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

export default function TrialManager() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [timeLeftMs, setTimeLeftMs] = useState(0)
  const [hasPhone, setHasPhone] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const countdownRef = useRef<{ origin: string; total: number } | null>(null)
  const expiredCalledRef = useRef(false)

  const expire = useCallback(() => {
    if (expiredCalledRef.current) return
    expiredCalledRef.current = true
    setTimeLeftMs(0)
    setPhase('done')
    setShowModal(true)
    fetch('/api/trial/expire', { method: 'POST' }).catch(() => {})
  }, [])

  // Single fetch on mount — determines state, starts trial if never started
  useEffect(() => {
    fetch('/api/trial/status')
      .then(r => r.ok ? r.json() : null)
      .then(async (data) => {
        if (!data || data.isPro) return  // STATE 6: pro or unauthenticated guest (returns isPro=false but trialUsed=true,trialStartedAt=null)

        setHasPhone(!!data.hasPhone)
        const { trialUsed, trialStartedAt, trialExtensionStartedAt } = data

        // STATE 4 / 5: extension exists
        if (trialExtensionStartedAt) {
          const elapsed = Date.now() - new Date(trialExtensionStartedAt).getTime()
          if (elapsed >= EXTENSION_MS) { expire(); return }  // STATE 5: extension expired
          countdownRef.current = { origin: trialExtensionStartedAt, total: EXTENSION_MS }
          setPhase('extension')  // STATE 4: extension active
          return
        }

        // STATE 3: trial used, no extension yet
        // Guard: trialStartedAt must be set — guests get trialUsed=true but trialStartedAt=null
        if (trialUsed && trialStartedAt) {
          setPhase('expired')
          return
        }

        // STATE 2: trial in progress
        if (trialStartedAt) {
          const elapsed = Date.now() - new Date(trialStartedAt).getTime()
          if (elapsed >= TRIAL_MS) { expire(); return }
          countdownRef.current = { origin: trialStartedAt, total: TRIAL_MS }
          setPhase('trial')
          return
        }

        // STATE 1: never started (trialUsed=false/null, trialStartedAt=null)
        // Guests are excluded above since they always get trialUsed=true
        if (!trialUsed) {
          const r = await fetch('/api/trial/start', { method: 'POST' })
          if (!r.ok) return
          const d = await r.json()
          if (d.trialStartedAt) {
            countdownRef.current = { origin: d.trialStartedAt, total: TRIAL_MS }
            setPhase('trial')
          }
        }
      })
      .catch(() => {})
  }, [expire])

  // Countdown tick — runs for 'trial' and 'extension' phases
  useEffect(() => {
    if (phase !== 'trial' && phase !== 'extension') return
    const cd = countdownRef.current
    if (!cd) return
    const tick = () => {
      const left = cd.total - (Date.now() - new Date(cd.origin).getTime())
      if (left <= 0) { expire() } else { setTimeLeftMs(left) }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [phase, expire])

  if (phase === 'idle') return null

  return (
    <>
      {showModal && (
        <TrialExpiredModal
          hasPhone={hasPhone}
          onExtended={() => window.location.reload()}
        />
      )}

      {/* STATE 2 / STATE 4: countdown banner */}
      {(phase === 'trial' || phase === 'extension') && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-4 px-4 py-3"
          style={{ background: 'rgba(0,8,0,0.95)', borderTop: '1px solid rgba(0,255,65,0.2)', backdropFilter: 'blur(8px)', fontFamily: mono }}
        >
          <span className="text-xs tracking-widest" style={{ color: 'rgba(0,255,65,0.45)' }}>
            PRO PREVIEW
          </span>
          <span className="text-sm font-bold tracking-widest tabular-nums" style={{ color: timeLeftMs < 60000 ? '#f87171' : '#00ff41' }}>
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

      {/* STATE 3: trial used, extension not yet taken */}
      {phase === 'expired' && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[250] flex items-center justify-center px-4 py-3 cursor-pointer select-none"
          style={{ background: 'rgba(0,8,0,0.97)', borderTop: '1px solid rgba(0,255,65,0.2)', backdropFilter: 'blur(8px)', fontFamily: mono }}
          onClick={() => { window.location.href = '/verify-phone' }}
        >
          <span className="text-sm font-bold tracking-widest" style={{ color: '#00ff41' }}>
            GET 15 MORE MINUTES FREE →
          </span>
        </div>
      )}
    </>
  )
}
