'use client'
import { useEffect } from 'react'

export default function TrialStarter({ shouldStart }: { shouldStart: boolean }) {
  useEffect(() => {
    console.log('[TrialStarter] mounted, shouldStart:', shouldStart)
    if (!shouldStart) return
    console.log('[TrialStarter] calling POST /api/trial/start')
    fetch('/api/trial/start', { method: 'POST' })
      .then(r => {
        console.log('[TrialStarter] /api/trial/start response status:', r.status)
        return r.ok ? r.json() : r.json().then(e => { console.log('[TrialStarter] error body:', e); return null })
      })
      .then(data => {
        console.log('[TrialStarter] /api/trial/start response body:', data)
        if (data?.trialStartedAt) {
          window.dispatchEvent(new CustomEvent('trial:started', { detail: { trialStartedAt: data.trialStartedAt } }))
        }
      })
      .catch(err => console.log('[TrialStarter] fetch error:', err))
  }, [shouldStart])

  return null
}
