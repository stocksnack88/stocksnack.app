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
    logging: false,
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
  ctx.fillText('stocksnack.app  ·  SNACKBUDDY50', src.width / 2, src.height + brandH / 2)
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

function downloadCanvas(canvas: HTMLCanvasElement, name: string) {
  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = name
  a.click()
}

type Props = {
  captureIds: string[]
  mode: 'single' | 'stitch' | 'multi'
  fileName?: string
}

export default function BlockShareButton({ captureIds, mode, fileName = 'stocksnack' }: Props) {
  const [status, setStatus] = useState<'idle' | 'busy'>('idle')

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
        const files = await Promise.all(
          branded.map(async (c, i) => {
            const blob = await toBlob(c)
            return new File([blob], `${fileName}-${i + 1}.png`, { type: 'image/png' })
          })
        )
        if (typeof navigator !== 'undefined' && navigator.share) {
          try {
            if (navigator.canShare?.({ files })) {
              await navigator.share({ files, title: 'StockSnack Analysis' })
              return
            }
          } catch { /* fall through */ }
        }
        for (let i = 0; i < branded.length; i++) {
          downloadCanvas(branded[i], files[i].name)
          if (i < branded.length - 1) await new Promise(r => setTimeout(r, 300))
        }
      } else {
        const merged = mode === 'stitch' && canvases.length > 1
          ? await stitchVertical(canvases)
          : canvases[0]
        const branded = addBranding(merged)
        const blob = await toBlob(branded)
        const file = new File([blob], `${fileName}.png`, { type: 'image/png' })
        if (typeof navigator !== 'undefined' && navigator.share) {
          try {
            if (navigator.canShare?.({ files: [file] })) {
              await navigator.share({ files: [file], title: 'StockSnack Analysis' })
              return
            }
          } catch { /* fall through */ }
        }
        downloadCanvas(branded, `${fileName}.png`)
      }
    } catch { /* silent */ } finally {
      setStatus('idle')
    }
  }

  return (
    <button
      onClick={handleShare}
      disabled={status === 'busy'}
      className="font-mono text-[10px] tracking-wider transition-colors"
      style={{ color: status === 'busy' ? 'rgba(0,255,65,0.15)' : 'rgba(0,255,65,0.35)' }}
    >
      {status === 'busy' ? '···' : 'SHARE'}
    </button>
  )
}
