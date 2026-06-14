'use client'
import { useState } from 'react'

const SCALE = 2
const BRAND_H_PX = 28

async function captureElement(id: string): Promise<HTMLCanvasElement | null> {
  const el = document.getElementById(id)
  if (!el) return null
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

function addBranding(src: HTMLCanvasElement): HTMLCanvasElement {
  const brandH = BRAND_H_PX * SCALE
  const out = document.createElement('canvas')
  out.width = src.width
  out.height = src.height + brandH
  const ctx = out.getContext('2d')!
  ctx.drawImage(src, 0, 0)
  ctx.fillStyle = '#001a00'
  ctx.fillRect(0, src.height, src.width, brandH)
  ctx.fillStyle = 'rgba(0,255,65,0.2)'
  ctx.fillRect(0, src.height, src.width, SCALE)
  ctx.fillStyle = 'rgba(0,255,65,0.6)'
  ctx.font = `bold ${11 * SCALE}px "Courier New", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('stocksnack.app  ·  PROMO CODE: SNACKBUDDY50', src.width / 2, src.height + brandH / 2)
  return out
}

async function stitchVertical(canvases: HTMLCanvasElement[]): Promise<HTMLCanvasElement> {
  const w = Math.max(...canvases.map(c => c.width))
  const h = canvases.reduce((a, c) => a + c.height, 0)
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, h)
  let y = 0
  for (const c of canvases) {
    ctx.drawImage(c, 0, y)
    y += c.height
  }
  return out
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
): string {
  const lines: string[] = []
  if (ticker || companyName) {
    lines.push([ticker, companyName].filter(Boolean).join(' — '))
  }
  if (signal) lines.push(`Signal: ${signal}`)
  if (projectedReturn != null || cagr != null) {
    const ret = projectedReturn != null ? `${projectedReturn.toFixed(1)}x` : null
    const cagrStr = cagr != null ? `${(cagr * 100).toFixed(1)}% CAGR` : null
    const parts = [ret, cagrStr].filter(Boolean).join(' (')
    lines.push(`5Y Projected Return: ${parts}${cagrStr ? ')' : ''}`)
  }
  lines.push('')
  lines.push('Analysed by StockSnack')
  lines.push('stocksnack.app')
  lines.push('PROMO CODE: SNACKBUDDY50 for 50% off Pro')
  return lines.join('\n')
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
    // Fallback: download image then open platform URL
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
      {/* Modal — always centered in viewport regardless of scroll position */}
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
            className="flex items-center justify-center w-7 h-7 rounded font-mono text-sm font-bold leading-none transition-colors"
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
          {images.length > 1 && (
            <p className="mt-1.5 font-mono text-[9px] text-center" style={{ color: 'rgba(0,255,65,0.3)' }}>
              +{images.length - 1} MORE IMAGE{images.length > 2 ? 'S' : ''}
            </p>
          )}
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
  ticker?: string
  companyName?: string | null
  signal?: string | null
  projectedReturn?: number | null
  cagr?: number | null
}

export default function BlockShareButton({
  captureIds,
  mode,
  fileName = 'stocksnack',
  ticker,
  companyName,
  signal,
  projectedReturn,
  cagr,
}: Props) {
  const [status, setStatus] = useState<'idle' | 'busy'>('idle')
  const [modal, setModal] = useState<ModalImage[] | null>(null)

  const defaultCaption = buildCaption(ticker, companyName, signal, projectedReturn, cagr)

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation()
    if (status === 'busy') return
    setStatus('busy')
    try {
      const canvases = (await Promise.all(captureIds.map(captureElement)))
        .filter((c): c is HTMLCanvasElement => c !== null)
      if (!canvases.length) return

      if (mode === 'multi') {
        const branded = canvases.map(addBranding)
        const items: ModalImage[] = await Promise.all(
          branded.map(async (c, i) => {
            const blob = await toBlob(c)
            return { dataUrl: c.toDataURL('image/png'), blob, name: `${fileName}-${i + 1}.png` }
          })
        )
        setModal(items)
      } else {
        const merged = mode === 'stitch' && canvases.length > 1
          ? await stitchVertical(canvases)
          : canvases[0]
        const branded = addBranding(merged)
        const blob = await toBlob(branded)
        const dataUrl = branded.toDataURL('image/png')
        const name = `${fileName}.png`
        setModal([{ dataUrl, blob, name }])
      }
    } catch { /* silent */ } finally {
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
        {status === 'busy' ? '···' : 'SHARE'}
      </button>
      {modal && (
        <ShareModal
          images={modal}
          defaultCaption={defaultCaption}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}
