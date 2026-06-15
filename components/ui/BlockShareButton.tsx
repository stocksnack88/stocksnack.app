'use client'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Share2 } from 'lucide-react'

const SCALE = 2

// Screenshots a DOM element with full style injection
async function captureDiv(el: HTMLElement): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import('html2canvas')
  return html2canvas(el, {
    backgroundColor: '#000000',
    scale: SCALE,
    useCORS: true,
    allowTaint: true,
    foreignObjectRendering: false,
    logging: false,
    onclone: (_clonedDoc: Document, clonedEl: HTMLElement) => {
      const styles = Array.from(document.styleSheets)
        .flatMap(sheet => {
          try { return Array.from(sheet.cssRules).map(r => r.cssText) }
          catch { return [] }
        })
        .join('\n')
      const style = clonedEl.ownerDocument.createElement('style')
      style.textContent = styles
      clonedEl.ownerDocument.head.appendChild(style)
    },
  })
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png')
  )
}

type ModalImage = { dataUrl: string; blob: Blob; name: string }

function buildCaption(
  ticker?: string,
  companyName?: string | null,
  signal?: string | null,
  projectedReturn?: number | null,
  cagr?: number | null,
  blockTitle?: string,
): string {
  const company = companyName || ticker || 'this stock'
  const cagrStr = cagr != null ? `${(cagr * 100).toFixed(1)}` : null
  const signalStr = signal || 'unknown'

  const para1 = `I just looked at ${company}'s ${blockTitle || 'analysis'} on StockSnack — ${signalStr} signal${cagrStr ? `, ${cagrStr}% CAGR projected` : ''}. Interesting numbers.`

  let para2: string
  if (blockTitle?.includes('MARKET COMPARISON')) {
    para2 = `This shows how ${company} stacks up against S&P 500 benchmarks on P/E ratio, FCF yield, and dividend yield.`
  } else if (blockTitle?.includes('PRICE PROJECTION')) {
    para2 = `This shows the projected upside across 3 valuation models — what the stock could be worth in 5 years.`
  } else if (blockTitle?.includes('FINANCIAL HEALTH')) {
    para2 = `This breaks down ${company}'s balance sheet strength across 24 financial checks.`
  } else if (blockTitle?.includes('ABOUT THE BUSINESS')) {
    para2 = `This shows where ${company} actually makes its money — product and geographic revenue breakdown.`
  } else if (blockTitle?.includes('OVERVIEW')) {
    para2 = `This is the full summary — score, signal, and projected return at a glance.`
  } else {
    para2 = `StockSnack scores all 500 S&P 500 stocks using 30 financial metrics.`
  }

  const para3 = `Check it out → stocksnack.app\nUse code SNACKBUDDY50 for 50% off Pro`

  return [para1, para2, para3].join('\n')
}

function ShareModal({
  images,
  defaultCaption,
  onClose,
}: {
  images: ModalImage[]
  defaultCaption: string
  onClose: () => void
}) {
  const [caption, setCaption] = useState(defaultCaption)
  const first = images[0]
  const encodedCaption = encodeURIComponent(caption)

  async function shareWithFiles(platform: 'whatsapp' | 'telegram') {
    const files = images.map(img => new File([img.blob], img.name, { type: 'image/png' }))
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        if (navigator.canShare?.({ files })) {
          await navigator.share({ files, text: caption, title: 'StockSnack Analysis' })
          return
        }
      } catch { /* fall through to download + url */ }
    }
    for (let i = 0; i < images.length; i++) {
      const a = document.createElement('a')
      a.href = images[i].dataUrl
      a.download = images[i].name
      a.click()
      if (i < images.length - 1) await new Promise(r => setTimeout(r, 300))
    }
    const url = platform === 'whatsapp'
      ? `https://wa.me/?text=${encodedCaption}`
      : `https://t.me/share/url?url=stocksnack.app&text=${encodedCaption}`
    window.open(url, '_blank')
  }

  async function handleDownload() {
    for (let i = 0; i < images.length; i++) {
      const a = document.createElement('a')
      a.href = images[i].dataUrl
      a.download = images[i].name
      a.click()
      if (i < images.length - 1) await new Promise(r => setTimeout(r, 300))
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9999]"
        style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
        onClick={onClose}
      />
      {/* Modal — always centered in viewport */}
      <div
        className="fixed z-[10000] rounded-lg"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'calc(100% - 2rem)',
          maxWidth: '24rem',
          maxHeight: '80vh',
          overflowY: 'auto',
          background: '#050505',
          border: '1px solid rgba(0,255,65,0.25)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — sticky so close button stays visible while scrolling */}
        <div
          className="sticky top-0 flex items-center justify-between px-4 py-3"
          style={{ background: '#050505', borderBottom: '1px solid rgba(0,255,65,0.1)', zIndex: 1 }}
        >
          <p className="font-mono text-[11px] font-bold tracking-widest" style={{ color: 'rgba(0,255,65,0.7)' }}>
            SHARE IMAGE
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-7 h-7 rounded font-mono text-sm font-bold leading-none"
            style={{ color: '#00ff41', background: 'rgba(0,255,65,0.12)', border: '1px solid rgba(0,255,65,0.35)' }}
          >
            ✕
          </button>
        </div>

        {/* Preview */}
        <div className="px-4 pt-4 pb-3">
          <img
            src={first.dataUrl}
            alt="Preview"
            className="w-full rounded"
            style={{ border: '1px solid rgba(0,255,65,0.1)', maxHeight: 220, objectFit: 'contain', background: '#000' }}
          />
        </div>

        {/* Caption */}
        <div className="px-4 pb-3">
          <p className="font-mono text-[9px] tracking-widest mb-1.5" style={{ color: 'rgba(0,255,65,0.4)' }}>
            CAPTION (EDITABLE)
          </p>
          <textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            rows={7}
            className="w-full rounded px-3 py-2 font-mono text-[11px] leading-relaxed resize-none"
            style={{
              background: 'rgba(0,255,65,0.04)',
              border: '1px solid rgba(0,255,65,0.15)',
              color: 'rgba(0,255,65,0.8)',
              outline: 'none',
            }}
          />
        </div>

        {/* Share buttons */}
        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          <button
            onClick={() => shareWithFiles('whatsapp')}
            className="rounded py-2.5 font-mono text-[10px] font-bold tracking-widest"
            style={{ background: 'rgba(37,211,102,0.12)', color: '#25d366', border: '1px solid rgba(37,211,102,0.3)' }}
          >
            WHATSAPP
          </button>
          <button
            onClick={() => shareWithFiles('telegram')}
            className="rounded py-2.5 font-mono text-[10px] font-bold tracking-widest"
            style={{ background: 'rgba(0,136,204,0.12)', color: '#0088cc', border: '1px solid rgba(0,136,204,0.3)' }}
          >
            TELEGRAM
          </button>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodedCaption}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded py-2.5 font-mono text-[10px] font-bold tracking-widest text-center"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            TWITTER / X
          </a>
          <button
            onClick={handleDownload}
            className="rounded py-2.5 font-mono text-[10px] font-bold tracking-widest"
            style={{ background: 'rgba(0,255,65,0.08)', color: 'rgba(0,255,65,0.8)', border: '1px solid rgba(0,255,65,0.25)' }}
          >
            DOWNLOAD
          </button>
        </div>
      </div>
    </>
  )
}

type Props = {
  captureIds: string[]
  mode: 'single' | 'stitch' | 'multi'
  fileName?: string
  blockTitle?: string
  ticker?: string
  companyName?: string | null
  signal?: string | null
  projectedReturn?: number | null
  cagr?: number | null
}

export default function BlockShareButton({
  captureIds,
  fileName = 'stocksnack',
  blockTitle,
  ticker,
  companyName,
  signal,
  projectedReturn,
  cagr,
}: Props) {
  const [status, setStatus] = useState<'idle' | 'busy'>('idle')
  const [modal, setModal] = useState<ModalImage[] | null>(null)

  const defaultCaption = buildCaption(ticker, companyName, signal, projectedReturn, cagr, blockTitle)

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation()
    if (status === 'busy') return
    setStatus('busy')
    try {
      // Collect source elements
      const sourceEls = captureIds
        .map(id => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null)
      if (!sourceEls.length) return

      // Build a full-screen render overlay with cloned block content
      const overlay = document.createElement('div')
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:9998',
        'background:#000000', 'overflow:hidden',
        "font-family:'Courier New',Courier,monospace",
      ].join(';')

      // Content wrapper — what html2canvas will screenshot.
      // display:flex prevents margin collapsing between cloned block elements.
      const contentWrap = document.createElement('div')
      contentWrap.style.cssText = 'padding:20px;background:#000000;display:flex;flex-direction:column;'

      // Header strip — two rows
      const headerBase = [
        'background:#001a00',
        'border-bottom:1px solid rgba(0,255,65,0.2)',
        "font-family:'Courier New',Courier,monospace",
        'font-weight:bold',
        'color:#00ff88',
        'letter-spacing:0.12em',
        'margin-bottom:16px',
      ].join(';')

      const header = document.createElement('div')
      header.style.cssText = headerBase

      // Row 1: ticker + company name, left-aligned
      const hRow1 = document.createElement('div')
      hRow1.style.cssText = 'padding:8px 16px;font-size:10px;'
      hRow1.textContent = [ticker, companyName].filter(Boolean).join(' — ')
      header.appendChild(hRow1)

      // Row 2: block title centered, slightly larger font
      if (blockTitle) {
        const hRow2 = document.createElement('div')
        hRow2.style.cssText = [
          'text-align:center',
          'padding:6px 16px 10px',
          'font-size:13px',
          'border-top:1px solid rgba(0,255,65,0.1)',
        ].join(';')
        hRow2.textContent = blockTitle
        header.appendChild(hRow2)
      }

      contentWrap.appendChild(header)

      // Clone each source element into the render div, stacked vertically
      for (let i = 0; i < sourceEls.length; i++) {
        const clone = sourceEls[i].cloneNode(true) as HTMLElement
        clone.style.width = '100%'
        clone.style.maxWidth = '100%'
        clone.style.boxSizing = 'border-box'
        clone.style.marginTop = '0'
        clone.style.paddingTop = '0'
        contentWrap.appendChild(clone)
        if (i < sourceEls.length - 1) {
          const sep = document.createElement('div')
          sep.style.cssText = 'height:1px;background:rgba(0,255,65,0.1);margin:12px 0;'
          contentWrap.appendChild(sep)
        }
      }

      // Branding strip as a real DOM element so it's part of the canvas
      const brand = document.createElement('div')
      brand.style.cssText = [
        'margin-top:16px',
        'padding:10px 20px',
        'background:#001a00',
        'border-top:1px solid rgba(0,255,65,0.2)',
        'text-align:center',
        "font-family:'Courier New',Courier,monospace",
        'font-size:11px',
        'font-weight:bold',
        'color:rgba(0,255,65,0.6)',
        'letter-spacing:0.12em',
      ].join(';')
      brand.textContent = 'stocksnack.app  ·  PROMO CODE: SNACKBUDDY50'
      contentWrap.appendChild(brand)

      overlay.appendChild(contentWrap)
      document.body.appendChild(overlay)

      // Wait two frames for the browser to lay out and paint the cloned content
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))

      // Screenshot the content wrapper (not the overlay, so we get tight bounds)
      const canvas = await captureDiv(contentWrap)
      console.log('[BlockShareButton] capture complete — canvas size:', canvas.width, 'x', canvas.height)

      // Remove overlay immediately after capture
      document.body.removeChild(overlay)

      const blob = await toBlob(canvas)
      const dataUrl = canvas.toDataURL('image/png')
      console.log('[BlockShareButton] setModal called — showing share modal')
      setModal([{ dataUrl, blob, name: `${fileName}.png` }])

    } catch (err) { console.error('[BlockShareButton] capture error:', err) } finally {
      setStatus('idle')
    }
  }

  return (
    <>
      <button
        onClick={handleShare}
        disabled={status === 'busy'}
        className="font-mono text-[10px] tracking-wider transition-colors"
        style={{ color: status === 'busy' ? 'rgba(0,255,65,0.15)' : 'rgba(0,255,65,0.35)' }}
      >
        {status === 'busy' ? '···' : <Share2 size={16} />}
      </button>
      {modal && typeof document !== 'undefined' && createPortal(
        <ShareModal
          images={modal}
          defaultCaption={defaultCaption}
          onClose={() => setModal(null)}
        />,
        document.body,
      )}
    </>
  )
}
