'use client'
import { useState, useEffect } from 'react'

const TRIAL_MS = 5 * 60 * 1000
const EXTENSION_MS = 15 * 60 * 1000
const font = "var(--font-geist-mono), 'Courier New', monospace"

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

export default function PricingTrialCountdown({
  trialStartedAt,
  trialExtensionStartedAt,
  trialUsed,
}: {
  trialStartedAt: string | null
  trialExtensionStartedAt: string | null
  trialUsed: boolean
}) {
  const [timeLeftMs, setTimeLeftMs] = useState<number | null>(null)

  useEffect(() => {
    function calc(): number | null {
      if (trialExtensionStartedAt) {
        const left = EXTENSION_MS - (Date.now() - new Date(trialExtensionStartedAt).getTime())
        return left > 0 ? left : null
      }
      if (!trialUsed && trialStartedAt) {
        const left = TRIAL_MS - (Date.now() - new Date(trialStartedAt).getTime())
        return left > 0 ? left : null
      }
      return null
    }
    const update = () => setTimeLeftMs(calc())
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [trialStartedAt, trialExtensionStartedAt, trialUsed])

  if (timeLeftMs === null) {
    return (
      <span style={{ display: 'inline-block', padding: '5px 10px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', fontFamily: font, border: '0.5px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.3)' }}>
        CURRENT PLAN
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-block', padding: '5px 10px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', fontFamily: font, border: '0.5px solid rgba(0,255,65,0.35)', color: '#00ff41' }}>
      {fmt(timeLeftMs)} LEFT
    </span>
  )
}
