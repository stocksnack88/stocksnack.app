'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function RefreshButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  function handleRefresh() {
    setBusy(true)
    router.refresh()
    setTimeout(() => setBusy(false), 1500)
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={busy}
      style={{
        background: 'rgba(0,255,136,0.08)',
        border: '1px solid rgba(0,255,136,0.3)',
        color: busy ? 'rgba(0,255,136,0.3)' : '#00ff88',
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: 10,
        letterSpacing: '0.15em',
        padding: '4px 14px',
        cursor: busy ? 'default' : 'pointer',
        borderRadius: 3,
      }}
    >
      {busy ? '···' : 'REFRESH'}
    </button>
  )
}
