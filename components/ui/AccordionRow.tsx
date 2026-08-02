'use client'
import { useState, type ReactNode } from 'react'

const DIVIDER = 'rgba(0,255,65,0.08)'
const DIM = 'rgba(0,255,65,0.45)'

export function StatusPill({ text, active }: { text: string; active: boolean }) {
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 'bold', letterSpacing: '0.1em',
        padding: '2px 10px', borderRadius: 3,
        background: active ? 'rgba(0,255,65,0.15)' : 'rgba(0,255,65,0.05)',
        color: active ? '#00ff41' : 'rgba(0,255,65,0.4)',
        border: `1px solid ${active ? 'rgba(0,255,65,0.4)' : 'rgba(0,255,65,0.15)'}`,
      }}
    >
      {text}
    </span>
  )
}

type RightSlot =
  | { kind: 'pill'; text: string; active: boolean }
  | { kind: 'chevron' }
  | { kind: 'value'; text: string }
  | { kind: 'custom'; node: ReactNode }

// One row shape reused everywhere: icon + label on the left, a pill/value/
// chevron/custom control on the right. Rows with `children` expand in place
// on click instead of always showing their detail -- e.g. install
// instructions and the feedback form both stay collapsed until asked for.
export default function AccordionRow({
  icon, label, right, children, defaultOpen = false,
}: {
  icon?: ReactNode
  label: string
  right: RightSlot
  children?: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const clickable = Boolean(children)

  function renderRight() {
    switch (right.kind) {
      case 'pill':
        return <StatusPill text={right.text} active={right.active} />
      case 'chevron':
        return (
          <span
            style={{
              color: 'rgba(0,255,65,0.3)', fontSize: 13, display: 'inline-block',
              transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s',
            }}
          >
            &rsaquo;
          </span>
        )
      case 'value':
        return <span style={{ color: 'rgba(0,255,65,0.85)', fontSize: 12 }}>{right.text}</span>
      case 'custom':
        return right.node
    }
  }

  return (
    <div style={{ borderBottom: `1px solid ${DIVIDER}` }}>
      <div
        onClick={() => clickable && setOpen(o => !o)}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={e => { if (clickable && (e.key === 'Enter' || e.key === ' ')) setOpen(o => !o) }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 0', cursor: clickable ? 'pointer' : 'default',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, color: DIM, fontSize: 12, letterSpacing: '0.02em' }}>
          {icon}
          {label}
        </span>
        {renderRight()}
      </div>
      {clickable && open && <div style={{ paddingBottom: 14 }}>{children}</div>}
    </div>
  )
}
