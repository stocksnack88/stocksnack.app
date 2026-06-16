'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

export default function NavDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
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
        onClick={() => setOpen(o => !o)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-haspopup="true"
        className="self-center tracking-[0.15em] transition-colors text-[11px] border rounded-sm px-[10px] py-[5px] cursor-pointer select-none"
        style={{
          background: 'none',
          borderColor: open ? 'rgba(0,255,65,0.5)' : 'rgba(0,255,65,0.25)',
          color: open ? '#00ff41' : 'rgba(0,255,65,0.5)',
          fontFamily: "var(--font-geist-mono), 'Courier New', monospace",
          lineHeight: 1,
          fontSize: 14,
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
            href="/market"
            role="menuitem"
            className="flex items-center justify-between px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors"
            style={{
              fontFamily: "var(--font-geist-mono), 'Courier New', monospace",
              borderBottom: '1px solid rgba(0,255,65,0.08)',
            }}
          >
            MARKET OVERVIEW <span style={{ fontSize: 10 }}>🔒</span>
          </Link>
          <Link
            href="/compare"
            role="menuitem"
            className="flex items-center justify-between px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors"
            style={{
              fontFamily: "var(--font-geist-mono), 'Courier New', monospace",
              borderBottom: '1px solid rgba(0,255,65,0.08)',
            }}
          >
            COMPARE <span style={{ fontSize: 10 }}>🔒</span>
          </Link>
          <Link
            href="/account"
            role="menuitem"
            className="block px-4 py-3 text-[11px] tracking-[0.12em] text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/[0.04] transition-colors"
            style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
          >
            ACCOUNT
          </Link>
        </div>
      )}
    </div>
  )
}
