'use client'
import { useState } from 'react'
import { Share2 } from 'lucide-react'

type Props = {
  ticker: string
  companyName: string | null
  signal: string | null
  projectedReturn: number | null
  cagr: number | null
  growthScore: number | null
  healthPasses: number | null
  scoredTotal: number
  finalScore: number | null
}

function buildShareText(p: Props): string {
  const ret     = p.projectedReturn != null ? `${p.projectedReturn.toFixed(1)}x` : '—'
  const cagrStr = p.cagr           != null ? `${(p.cagr * 100).toFixed(1)}% CAGR` : '—'
  const growth  = p.growthScore    != null ? `${Number(p.growthScore).toFixed(1)}%` : '—'
  const health  = p.healthPasses   != null ? `${p.healthPasses}/${p.scoredTotal} checks passed` : '—'
  const final_  = p.finalScore     != null ? `${Number(p.finalScore).toFixed(1)}/100` : '—'
  const signal  = (p.signal ?? '—').toUpperCase()

  return (
    `${p.ticker} — ${p.companyName ?? p.ticker}\n` +
    `Signal: ${signal}\n` +
    `5Y Projected Return: ${ret} (${cagrStr})\n` +
    `Growth Quality: ${growth}\n` +
    `Financial Health: ${health}\n` +
    `Final Score: ${final_}\n` +
    `\n` +
    `Analysed by StockSnack\n` +
    `\n` +
    `Try it free → stocksnack.app\n` +
    `\n` +
    `Use code SNACKBUDDY50 for 50% off Pro`
  )
}

export default function ShareButton(props: Props) {
  const [status, setStatus] = useState<'idle' | 'copied'>('idle')

  const handleShare = async () => {
    const text = buildShareText(props)

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch {
        // user cancelled or API unavailable — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      // silent — clipboard blocked
    }
  }

  return (
    <button
      onClick={handleShare}
      className="border border-[#00ff41]/25 rounded px-2.5 py-1 font-mono text-xs tracking-wider transition-colors"
      style={{ color: status === 'copied' ? '#00ff41' : 'rgba(0,255,65,0.4)' }}
    >
      {status === 'copied' ? 'COPIED!' : <Share2 size={16} />}
    </button>
  )
}
