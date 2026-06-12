'use client'
import { useState } from 'react'

interface Props {
  hasPhone: boolean
  onExtended: (extensionAt: string) => void
}

export default function TrialExpiredModal({ hasPhone, onExtended }: Props) {
  const [error, setError] = useState<string | null>(null)

  async function handleGetMore() {
    setError(null)
    if (hasPhone) {
      try {
        const r = await fetch('/api/trial/extend', { method: 'POST' })
        const data = await r.json()
        if (r.ok) { onExtended(data.trialExtensionStartedAt) }
        else { setError(data.error ?? 'Could not extend trial') }
      } catch { setError('Network error') }
    } else {
      window.location.href = '/verify-phone'
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-sm rounded-lg overflow-hidden"
        style={{ border: '1px solid rgba(0,255,65,0.25)', background: '#030f03', fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
      >
        <div className="px-6 py-5" style={{ borderBottom: '1px solid rgba(0,255,65,0.12)', background: 'rgba(0,255,65,0.04)' }}>
          <p className="text-xs tracking-[0.3em] mb-1" style={{ color: 'rgba(0,255,65,0.35)' }}>FREE TRIAL</p>
          <p className="text-lg font-bold tracking-widest" style={{ color: '#00ff41' }}>YOUR TRIAL HAS ENDED</p>
        </div>

        <div className="px-6 py-6 flex flex-col gap-3">
          <>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(0,255,65,0.55)' }}>
              Verify your phone number and get 15 more minutes free.
            </p>
            {error && <p className="text-[10px]" style={{ color: '#f87171' }}>{error}</p>}
            <button
              onClick={handleGetMore}
              className="w-full py-3 rounded font-bold text-xs tracking-widest transition-opacity hover:opacity-90"
              style={{ background: '#00ff41', color: '#000' }}
            >
              GET 15 MORE MINUTES FREE →
            </button>
          </>

          <a
            href="/pricing"
            className="w-full py-3 rounded font-bold text-xs tracking-widest transition-colors text-center block"
            style={{ border: '1px solid rgba(0,255,65,0.2)', color: 'rgba(0,255,65,0.4)', background: 'transparent', textDecoration: 'none' }}
          >
            UPGRADE TO PRO →
          </a>
          <button
            onClick={() => { window.location.href = '/screener' }}
            className="w-full py-2 text-xs tracking-widest transition-colors"
            style={{ color: 'rgba(0,255,65,0.25)', background: 'transparent' }}
          >
            BACK TO SCREENER
          </button>
        </div>
      </div>
    </div>
  )
}
