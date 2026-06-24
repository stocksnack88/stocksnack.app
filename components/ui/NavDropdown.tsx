'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useGuidedTour } from './GuidedTour'
import { playClick } from '@/lib/sounds'

const MONO: React.CSSProperties = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }

export default function NavDropdown() {
  const { startTour, menuLabel } = useGuidedTour()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onTourOpen = () => setOpen(true)
    window.addEventListener('tour-open-menu', onTourOpen)
    return () => window.removeEventListener('tour-open-menu', onTourOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if ((e.target as HTMLElement)?.closest?.('[data-tour-spotlight]')) return
        setOpen(false)
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('click', onOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  return (
    <div ref={ref} className="relative flex items-center">
      {/* trigger */}
      <button
        data-tour-id="nav-menu-button"
        onClick={() => { playClick(); setOpen(o => !o) }}
        aria-label="Open menu"
        aria-expanded={open}
        aria-haspopup="true"
        className="self-center mt-1 tracking-widest transition-colors cursor-pointer select-none py-3 px-1"
        style={{
          background: 'none',
          border: 'none',
          color: open ? '#00ff41' : 'rgba(0,255,65,0.5)',
          ...MONO,
        }}
      >
        {open ? '✕' : '≡'}
      </button>

      {/* dropdown panel */}
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            background: '#000',
            border: '1px solid rgba(0,255,65,0.2)',
            borderRadius: 4,
            minWidth: 200,
            zIndex: 200,
            padding: '4px 0',
            boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
          }}
        >
          <Link
            href="/screener"
            role="menuitem"
            onClick={() => playClick()}
            className="flex items-center justify-between px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors"
            style={{ ...MONO, borderBottom: '1px solid rgba(0,255,65,0.08)' }}
          >
            SCREENER
          </Link>
          <Link
            href="/account"
            role="menuitem"
            onClick={() => playClick()}
            className="flex items-center justify-between px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors"
            style={{ ...MONO, borderBottom: '1px solid rgba(0,255,65,0.08)' }}
          >
            ACCOUNT
          </Link>
          <Link
            href="/blog"
            role="menuitem"
            onClick={() => playClick()}
            className="flex items-center justify-between px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors"
            style={{ ...MONO, borderBottom: '1px solid rgba(0,255,65,0.08)' }}
          >
            BLOG
          </Link>
          <button
            data-tour-id="nav-tour-button"
            role="menuitem"
            onClick={() => { setOpen(false); startTour() }}
            className="block w-full text-left px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors cursor-pointer"
            style={{ background: 'none', border: 'none', borderBottom: '1px solid rgba(0,255,65,0.08)', ...MONO }}
          >
            {menuLabel}
          </button>
          <Link
            href="/market"
            role="menuitem"
            onClick={() => playClick()}
            className="flex items-center justify-between px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors"
            style={{ ...MONO, borderBottom: '1px solid rgba(0,255,65,0.08)' }}
          >
            MARKET OVERVIEW <span style={{ fontSize: 10 }}>🔒</span>
          </Link>
          <Link
            href="/compare"
            role="menuitem"
            onClick={() => playClick()}
            className="flex items-center justify-between px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors"
            style={{ ...MONO }}
          >
            COMPARE <span style={{ fontSize: 10 }}>🔒</span>
          </Link>
        </div>
      )}
    </div>
  )
}
