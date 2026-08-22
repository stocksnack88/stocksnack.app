'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useGuidedTour } from './GuidedTour'
import { playClick } from '@/lib/sounds'

const MONO: React.CSSProperties = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }
const GREEN = '#00ff41'

const itemClass = 'flex items-center justify-between px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors'
const itemStyle: React.CSSProperties = { ...MONO, borderBottom: '1px solid rgba(0,255,65,0.08)' }

// Solid pill badge -- same treatment as the PRO badge / GO button elsewhere
// in the app, so a category header reads as a distinct tier from the plain
// links nested under it, instead of just dimmer text that blends in.
function Badge({ children, outline }: { children: string; outline?: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      background: outline ? 'transparent' : GREEN,
      color: outline ? 'rgba(0,255,65,0.4)' : '#000',
      border: outline ? '1px solid rgba(0,255,65,0.3)' : 'none',
      fontWeight: 'bold',
      fontSize: 9,
      letterSpacing: '0.08em',
      padding: '3px 8px',
      borderRadius: 3,
      ...MONO,
    }}>
      {children}
    </span>
  )
}

function CategoryHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={() => { playClick(); onToggle() }}
      aria-expanded={open}
      className="flex items-center justify-between w-full px-4 py-2.5 cursor-pointer transition-colors hover:bg-[#00ff41]/[0.04]"
      style={{
        background: 'none',
        border: 'none',
        borderBottom: '1px solid rgba(0,255,65,0.08)',
      }}
    >
      <Badge>{label}</Badge>
      <span style={{ color: 'rgba(0,255,65,0.5)', fontSize: 11, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>
        ▸
      </span>
    </button>
  )
}

export default function NavDropdown({ planLabel }: { planLabel?: string }) {
  const { startTour, menuLabel } = useGuidedTour()
  const [open, setOpen] = useState(false)
  const [analyzeOpen, setAnalyzeOpen] = useState(true)
  const [moreOpen, setMoreOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onTourOpen = () => setOpen(true)
    const onTourClose = () => setOpen(false)
    window.addEventListener('tour-open-menu', onTourOpen)
    window.addEventListener('tour-close-menu', onTourClose)
    return () => {
      window.removeEventListener('tour-open-menu', onTourOpen)
      window.removeEventListener('tour-close-menu', onTourClose)
    }
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
          data-tour-id="nav-menu-panel"
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
          {planLabel && (
            <Link
              href="/account"
              role="menuitem"
              onClick={() => playClick()}
              className={itemClass}
              style={itemStyle}
            >
              PLAN
              <Badge outline={planLabel === 'FREE'}>{planLabel}</Badge>
            </Link>
          )}

          {/* ANALYZE -- the core tools, expanded by default */}
          <CategoryHeader label="ANALYZE" open={analyzeOpen} onToggle={() => setAnalyzeOpen(o => !o)} />
          {analyzeOpen && (
            <>
              <Link href="/screener" role="menuitem" onClick={() => playClick()} className={itemClass} style={{ ...itemStyle, paddingLeft: '1.5rem' }}>
                SCREENER
              </Link>
              <Link href="/watchlist" role="menuitem" onClick={() => playClick()} className={itemClass} style={{ ...itemStyle, paddingLeft: '1.5rem' }}>
                WATCHLIST
              </Link>
              <Link href="/market" role="menuitem" onClick={() => playClick()} className={itemClass} style={{ ...itemStyle, paddingLeft: '1.5rem' }}>
                MARKET OVERVIEW
              </Link>
              <Link href="/compare" role="menuitem" onClick={() => playClick()} className={itemClass} style={{ ...itemStyle, paddingLeft: '1.5rem' }}>
                STOCK COMPARE
              </Link>
            </>
          )}

          {/* MORE -- secondary items, collapsed by default */}
          <CategoryHeader label="MORE" open={moreOpen} onToggle={() => setMoreOpen(o => !o)} />
          {moreOpen && (
            <>
              <Link href="/account" role="menuitem" onClick={() => playClick()} className={itemClass} style={{ ...itemStyle, paddingLeft: '1.5rem' }}>
                ACCOUNT
              </Link>
              <Link href="/blog" role="menuitem" onClick={() => playClick()} className={itemClass} style={{ ...itemStyle, paddingLeft: '1.5rem' }}>
                BLOG
              </Link>
            </>
          )}

          {/* Always visible -- the guided tour targets this exact button
              mid-flow (GuidedTour.tsx's nav-menu-panel step), so it can't
              be nested inside a collapsible category. */}
          <button
            data-tour-id="nav-tour-button"
            role="menuitem"
            onClick={() => { setOpen(false); startTour() }}
            className="block w-full text-left px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors cursor-pointer"
            style={{ background: 'none', border: 'none', ...MONO }}
          >
            {menuLabel}
          </button>
        </div>
      )}
    </div>
  )
}
