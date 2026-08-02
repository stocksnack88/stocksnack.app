const GREEN = '#00ff41'
const FONT  = "var(--font-geist-mono), 'Courier New', monospace"

export type FunnelTier = { label: string; count: number; pctOfTotal: number }

// Horizontal geometry -- MAX_W/VBW ratio controls how much of the width the
// funnel itself takes up vs. the reserved outside-label column on the right.
const VBW = 1000
const CENTER_X = 360 // off-center: right side reserved for outside leader-line labels
const MAX_W = 640
const MIN_W = 85
const FLOOR_PCT = 4 // visual-only floor so a near-zero tier still renders a sliver; never affects the displayed number

// Vertical geometry -- taller bands + bigger fonts than the first version,
// per feedback that it read too small/cramped.
const BAND_H = 115
const BAND_GAP = 16

// Two font scales: INSIDE text is constrained by the band's own (data-driven)
// width, so it stays modest; OUTSIDE text sits in the unconstrained label
// column, so it can go bigger. The threshold is picked so the same two tiers
// that fit inside at the old, smaller size still fit here -- the layout
// doesn't reshuffle, everything just reads bigger.
const INSIDE_LABEL_FONT = 18
const INSIDE_VALUE_FONT = 15
const OUTSIDE_LABEL_FONT = 24
const OUTSIDE_VALUE_FONT = 20
const INSIDE_LABEL_THRESHOLD = 190 // band bottom width below this can't fit INSIDE_LABEL_FONT text -> label moves outside

function widthForPct(pct: number) {
  const visualPct = Math.max(pct, FLOOR_PCT)
  return MIN_W + (MAX_W - MIN_W) * (visualPct / 100)
}

export default function SignalFunnel({ tiers }: { tiers: FunnelTier[] }) {
  const bandColors = tiers.map((_, i) => {
    if (i === 0) return 'rgba(0,255,65,0.12)'
    if (i === 1) return 'rgba(0,255,65,0.22)'
    if (i === 2) return 'rgba(0,255,65,0.42)'
    return GREEN
  })

  // Band i tapers from the PREVIOUS tier's width (top) to its own width
  // (bottom) -- so the trapezoid shape directly encodes the real drop
  // between consecutive tiers, not a decorative taper.
  const bottomWidths = tiers.map(t => widthForPct(t.pctOfTotal))
  const topWidths = [MAX_W, ...bottomWidths.slice(0, -1)]

  const topMargin = 16
  const totalH = topMargin * 2 + tiers.length * BAND_H + (tiers.length - 1) * BAND_GAP
  const outsideLabelX = CENTER_X + MAX_W / 2 + 60

  return (
    <svg viewBox={`0 0 ${VBW} ${totalH}`} width="100%" role="img" style={{ fontFamily: FONT }}>
      <title>Signal funnel: {tiers.map(t => `${t.label} ${t.count} (${t.pctOfTotal}%)`).join(', ')}</title>
      {tiers.map((tier, i) => {
        const top = topMargin + i * (BAND_H + BAND_GAP)
        const bottom = top + BAND_H
        const midY = top + BAND_H / 2
        const topW = topWidths[i]
        const bottomW = bottomWidths[i]
        const topLeft = CENTER_X - topW / 2
        const topRight = CENTER_X + topW / 2
        const bottomLeft = CENTER_X - bottomW / 2
        const bottomRight = CENTER_X + bottomW / 2
        const inside = bottomW >= INSIDE_LABEL_THRESHOLD

        const edgeMidX = (topRight + bottomRight) / 2

        return (
          <g key={tier.label}>
            <polygon
              points={`${topLeft},${top} ${topRight},${top} ${bottomRight},${bottom} ${bottomLeft},${bottom}`}
              fill={bandColors[i]}
              stroke="rgba(0,255,65,0.3)"
              strokeWidth={1.5}
            />
            {inside ? (
              <>
                <text x={CENTER_X} y={midY - 8} textAnchor="middle" fontSize={INSIDE_LABEL_FONT} fontWeight="bold" fill={i === 3 ? '#001a08' : GREEN} letterSpacing="0.05em">
                  {tier.label}
                </text>
                <text x={CENTER_X} y={midY + 15} textAnchor="middle" fontSize={INSIDE_VALUE_FONT} fill={i === 3 ? 'rgba(0,26,8,0.7)' : 'rgba(0,255,65,0.7)'}>
                  {tier.count.toLocaleString()} ({tier.pctOfTotal}%)
                </text>
              </>
            ) : (
              <>
                <line x1={edgeMidX} y1={midY} x2={outsideLabelX - 12} y2={midY} stroke="rgba(0,255,65,0.55)" strokeWidth={1.5} />
                <circle cx={edgeMidX} cy={midY} r={4} fill={GREEN} />
                <text x={outsideLabelX} y={midY - 8} fontSize={OUTSIDE_LABEL_FONT} fontWeight="bold" fill={GREEN} letterSpacing="0.05em">
                  {tier.label}
                </text>
                <text x={outsideLabelX} y={midY + 18} fontSize={OUTSIDE_VALUE_FONT} fill="rgba(0,255,65,0.7)">
                  {tier.count.toLocaleString()} ({tier.pctOfTotal}%)
                </text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
