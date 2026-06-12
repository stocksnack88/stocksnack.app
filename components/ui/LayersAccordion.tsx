'use client'
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

type Ctx = {
  opens: boolean[]
  isEntering: boolean
  toggle: (i: number) => void
  setAll: (open: boolean) => void
  stopEntering: () => void
}

const LayerCtx = createContext<Ctx | null>(null)

function useLayerCtx() {
  const ctx = useContext(LayerCtx)
  if (!ctx) throw new Error('Must be inside LayerProvider')
  return ctx
}

export function LayerProvider({
  count,
  animCount,
  childMap,
  children,
}: {
  count: number
  animCount?: number
  childMap?: Record<number, number[]>
  children: React.ReactNode
}) {
  const allChildIds = childMap ? Object.values(childMap).flat() : []
  const [opens, setOpens] = useState<boolean[]>(
    Array.from({ length: count }, (_, i) => allChildIds.includes(i))
  )
  const [isEntering, setIsEntering] = useState(true)

  const stopEntering = useCallback(() => setIsEntering(false), [])

  useEffect(() => {
    console.log('[LayerProvider] isEntering:', isEntering)
  }, [isEntering])

  useEffect(() => {
    const timerCount = animCount ?? count
    const ms = (timerCount - 1) * 200 + 700
    console.log('[LayerProvider] mounted, count:', count, 'timer ms:', ms)
    const t = setTimeout(stopEntering, ms)
    return () => clearTimeout(t)
  }, [count, animCount, stopEntering])

  const toggle = (i: number) => setOpens(prev => {
    const wasOpen = prev[i]
    const next = prev.map((v, j): boolean => (j === i ? !v : v))
    // When opening a parent, also open its children
    if (!wasOpen && childMap?.[i]) {
      for (const cid of childMap[i]) next[cid] = true
    }
    return next
  })

  const setAll = (open: boolean) => {
    stopEntering()
    setOpens(Array(count).fill(open))
  }

  return (
    <LayerCtx.Provider value={{ opens, isEntering, toggle, setAll, stopEntering }}>
      {children}
    </LayerCtx.Provider>
  )
}

export function ExpandCollapseButton() {
  const { opens, setAll, isEntering } = useLayerCtx()
  const allOpen = isEntering || opens.every(Boolean)
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
  const { opens, isEntering, toggle, stopEntering } = useLayerCtx()
  const open = opens[id] ?? false
  const showBody = open || isEntering

  return (
    <section
      className="rounded overflow-hidden"
      style={{ ...card, animation: `fadeInUp 500ms ease-out ${id * 200}ms both` }}
    >
      <div
        className="px-5 py-4 flex items-start justify-between cursor-pointer select-none"
        style={{ background: "#001a00", borderBottom: showBody ? "1px solid rgba(0,255,65,0.1)" : "none" }}
        onClick={() => { if (isEntering) stopEntering(); toggle(id) }}
      >
        <div className="flex-1 min-w-0">{header}</div>
        <div className="ml-3 mt-0.5 flex-shrink-0" style={{ color: "rgba(0,255,65,0.4)" }}>
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ transform: showBody ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
          >
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {showBody && <>{children}</>}
    </section>
  )
}

export function ChildCollapsibleLayer({
  id,
  header,
  children,
}: {
  id: number
  header: React.ReactNode
  children: React.ReactNode
}) {
  const { opens, isEntering, toggle, stopEntering } = useLayerCtx()
  const open = opens[id] ?? false

  return (
    <div style={{ borderTop: "1px solid rgba(0,255,65,0.1)" }}>
      <div
        className="px-5 py-4 flex items-start justify-between cursor-pointer select-none"
        style={{ background: "#001a00", borderBottom: open ? "1px solid rgba(0,255,65,0.1)" : "none" }}
        onClick={() => { if (isEntering) stopEntering(); toggle(id) }}
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
    </div>
  )
}
