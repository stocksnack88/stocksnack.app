'use client'
import React, { createContext, useContext, useState } from 'react'

type Ctx = {
  opens: boolean[]
  toggle: (i: number) => void
  setAll: (open: boolean) => void
}

const LayerCtx = createContext<Ctx | null>(null)

function useLayerCtx() {
  const ctx = useContext(LayerCtx)
  if (!ctx) throw new Error('Must be inside LayerProvider')
  return ctx
}

export function LayerProvider({ count, children }: { count: number; children: React.ReactNode }) {
  const [opens, setOpens] = useState<boolean[]>(Array(count).fill(false))
  const toggle = (i: number) => setOpens(prev => prev.map((v, j) => (j === i ? !v : v)))
  const setAll  = (open: boolean) => setOpens(prev => prev.map(() => open))
  return <LayerCtx.Provider value={{ opens, toggle, setAll }}>{children}</LayerCtx.Provider>
}

export function ExpandCollapseButton() {
  const { opens, setAll } = useLayerCtx()
  const allOpen = opens.every(Boolean)
  return (
    <button
      onClick={() => setAll(!allOpen)}
      className="border border-[#00ff41]/25 rounded px-2.5 py-1 font-mono text-xs text-[#00ff41]/40 hover:text-[#00ff41] transition-colors tracking-wider"
    >
      {allOpen ? 'COLLAPSE ALL' : 'EXPAND ALL'}
    </button>
  )
}

const card: React.CSSProperties = { border: "1px solid rgba(0,255,65,0.2)", background: "rgba(0,255,65,0.02)" }

export function CollapsibleLayer({
  id,
  header,
  children,
}: {
  id: number
  header: React.ReactNode
  children: React.ReactNode
}) {
  const { opens, toggle } = useLayerCtx()
  const open = opens[id] ?? false
  return (
    <section className="rounded overflow-hidden" style={card}>
      <div
        className="px-5 py-4 flex items-start justify-between cursor-pointer select-none"
        style={{ background: "#001a00", borderBottom: open ? "1px solid rgba(0,255,65,0.1)" : "none" }}
        onClick={() => toggle(id)}
      >
        <div className="flex-1 min-w-0">{header}</div>
        <div className="ml-3 mt-0.5 flex-shrink-0" style={{ color: "rgba(0,255,65,0.4)" }}>
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
          >
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {open && <>{children}</>}
    </section>
  )
}
