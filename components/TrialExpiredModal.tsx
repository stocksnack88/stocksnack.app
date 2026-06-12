'use client'
import { useState } from 'react'

interface Props {
  hasPhone: boolean
  onExtended: (extensionAt: string) => void
  onClose: () => void
}

export default function TrialExpiredModal({ hasPhone, onExtended, onClose }: Props) {
  const [showPhoneInput, setShowPhoneInput] = useState(false)
  const [phone, setPhone] = useState('')
  const [verifying, setVerifying] = useState(false)
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
      setShowPhoneInput(true)
    }
  }

  async function handleVerify() {
    if (!phone.trim() || verifying) return
    setVerifying(true)
    setError(null)
    try {
      const r = await fetch('/api/trial/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const data = await r.json()
      if (r.ok) { onExtended(data.trialExtensionStartedAt) }
      else { setError(data.error ?? 'Verification failed') }
    } catch { setError('Network error') } finally { setVerifying(false) }
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
          {showPhoneInput ? (
            <>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(0,255,65,0.55)' }}>
                Enter your phone number to get 15 more minutes free.
              </p>
              <input
                type="tel"
                placeholder="+1 234 567 8900"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleVerify()}
                autoFocus
                className="w-full bg-black border rounded px-3 py-2.5 text-xs font-mono outline-none"
                style={{ borderColor: 'rgba(0,255,65,0.25)', color: '#00ff41' }}
              />
              {error && <p className="text-[10px]" style={{ color: '#f87171' }}>{error}</p>}
              <button
                onClick={handleVerify}
                disabled={verifying || !phone.trim()}
                className="w-full py-3 rounded font-bold text-xs tracking-widest transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: '#00ff41', color: '#000' }}
              >
                {verifying ? 'VERIFYING...' : 'VERIFY →'}
              </button>
            </>
          ) : (
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
          )}

          <a
            href="/pricing"
            className="w-full py-3 rounded font-bold text-xs tracking-widest transition-colors text-center block"
            style={{ border: '1px solid rgba(0,255,65,0.2)', color: 'rgba(0,255,65,0.4)', background: 'transparent', textDecoration: 'none' }}
          >
            UPGRADE TO PRO →
          </a>
          <button
            onClick={onClose}
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
