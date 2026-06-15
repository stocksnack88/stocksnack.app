'use client'
import { useState } from 'react'

export default function CopyReportButton({ report }: { report: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'err'>('idle')

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(report)
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('err')
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  const label = status === 'copied' ? 'COPIED!' : status === 'err' ? 'FAILED' : 'COPY REPORT'
  const color = status === 'copied' ? '#00ff88' : status === 'err' ? '#ef4444' : 'rgba(0,255,136,0.5)'

  return (
    <button
      onClick={handleCopy}
      style={{
        background: 'rgba(0,255,136,0.05)',
        border: '1px solid rgba(0,255,136,0.2)',
        color,
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: 10,
        letterSpacing: '0.15em',
        padding: '4px 14px',
        cursor: 'pointer',
        borderRadius: 3,
      }}
    >
      {label}
    </button>
  )
}
