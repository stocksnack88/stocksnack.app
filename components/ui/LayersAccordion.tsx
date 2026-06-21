'use client'
import React, { createContext, useContext, useState, useEffect } from 'react'
import SegmentBreakdown from '@/components/ui/SegmentBreakdown'

type Seg = { name: string; pct: number; cagr: number | null; value: number }

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

export function LayerProvider({
  count,
  childMap,
  briefExpand,
  defaultOpenIds,
  children,
}: {
  count: number
  childMap?: Record<number, number[]>
  briefExpand?: { startMs: number; durationMs: number }
  defaultOpenIds?: number[]
  children: React.ReactNode
}) {
  const [opens, setOpens] = useState<boolean[]>(() => {
    const arr = Array(count).fill(false)
    defaultOpenIds?.forEach(id => { arr[id] = true })
    return arr
  })

  useEffect(() => {
    if (!briefExpand) return
    const t1 = setTimeout(
      () => setOpens(prev => Array(prev.length).fill(true)),
      briefExpand.startMs,
    )
    const t2 = setTimeout(
      () => setOpens(prev => prev.map((_, i) => defaultOpenIds?.includes(i) ?? false)),
      briefExpand.startMs + briefExpand.durationMs,
    )
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (i: number) => setOpens(prev => {
    const wasOpen = prev[i]
    const next = prev.map((v, j): boolean => (j === i ? !v : v))
    if (childMap?.[i]) {
      for (const cid of childMap[i]) next[cid] = !wasOpen
    }
    return next
  })

  const setAll = (open: boolean) => setOpens(Array(count).fill(open))

  return (
    <LayerCtx.Provider value={{ opens, toggle, setAll }}>
      {children}
    </LayerCtx.Provider>
  )
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
  shareButton,
  children,
}: {
  id: number
  header: React.ReactNode
  shareButton?: React.ReactNode
  children: React.ReactNode
}) {
  const { opens, toggle } = useLayerCtx()
  const open = opens[id] ?? false

  return (
    <section
      className="rounded overflow-hidden"
      style={{ ...card, animation: 'fadeInUp 400ms ease-out both' }}
    >
      <div
        className="px-5 py-4 flex items-start justify-between cursor-pointer select-none"
        style={{ background: "#001a00", borderBottom: open ? "1px solid rgba(0,255,65,0.1)" : "none" }}
        onClick={() => toggle(id)}
      >
        <div className="flex-1 min-w-0">{header}</div>
        <div className="flex items-center gap-2 ml-3 mt-0.5 flex-shrink-0">
          {open && shareButton && (
            <div onClick={e => e.stopPropagation()}>{shareButton}</div>
          )}
          <div style={{ color: "rgba(0,255,65,0.4)" }}>
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none"
              style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
            >
              <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 300ms ease-in-out' }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          {children}
        </div>
      </div>
    </section>
  )
}

export function CollapsibleSectionHeader({
  id,
  label,
  shareButton,
  children,
}: {
  id: number
  label: string
  shareButton?: React.ReactNode
  children: React.ReactNode
}) {
  const { opens, toggle } = useLayerCtx()
  const open = opens[id] ?? false

  return (
    <div style={{ animation: 'fadeInUp 400ms ease-out both' }}>
      <div
        className="flex items-center justify-between cursor-pointer select-none py-2"
        onClick={() => toggle(id)}
      >
        <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>{label}</p>
        <div className="flex items-center gap-2">
          {open && shareButton && (
            <div onClick={e => e.stopPropagation()}>{shareButton}</div>
          )}
          <div style={{ color: "rgba(0,255,65,0.4)" }}>
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none"
              style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
            >
              <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 300ms ease-in-out' }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div className="space-y-4 pt-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ChildCollapsibleLayer({
  id,
  header,
  shareButton,
  children,
}: {
  id: number
  header: React.ReactNode
  shareButton?: React.ReactNode
  children: React.ReactNode
}) {
  const { opens, toggle } = useLayerCtx()
  const open = opens[id] ?? false

  return (
    <section className="rounded overflow-hidden" style={{ ...card, animation: 'fadeInUp 400ms ease-out both' }}>
      <div
        className="px-5 py-4 flex items-start justify-between cursor-pointer select-none"
        style={{ background: "#001a00", borderBottom: open ? "1px solid rgba(0,255,65,0.1)" : "none" }}
        onClick={() => toggle(id)}
      >
        <div className="flex-1 min-w-0">{header}</div>
        <div className="flex items-center gap-2 ml-3 mt-0.5 flex-shrink-0">
          {open && shareButton && (
            <div onClick={e => e.stopPropagation()}>{shareButton}</div>
          )}
          <div style={{ color: "rgba(0,255,65,0.4)" }}>
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none"
              style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
            >
              <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 300ms ease-in-out' }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          {children}
        </div>
      </div>
    </section>
  )
}

export function MethodologyToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div
        className="flex items-center justify-center py-2"
        style={{ borderBottom: '1px solid rgba(0,255,65,0.1)' }}
      >
        <button
          className="text-[10px] font-mono tracking-widest px-3 py-1 rounded-full border"
          style={{
            background: 'rgba(0,255,65,0.08)',
            borderColor: 'rgba(0,255,65,0.55)',
            color: '#00ff41',
          }}
          onClick={() => setOpen(v => !v)}
        >
          {open ? '▲ HIDE METHODOLOGY' : "▼ HOW IT'S CALCULATED"}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 300ms ease-in-out' }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          {children}
        </div>
      </div>
    </>
  )
}

export function ConnectedSegmentBreakdown({
  id,
  title,
  segs,
  borderedBottom,
}: {
  id: number
  title: string
  segs: Seg[]
  borderedBottom?: boolean
}) {
  const { opens, toggle } = useLayerCtx()
  return (
    <SegmentBreakdown
      title={title}
      segs={segs}
      borderedBottom={borderedBottom}
      open={opens[id] ?? false}
      onToggle={() => toggle(id)}
    />
  )
}
