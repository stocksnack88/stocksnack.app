const GREEN = '#00ff41'
const FONT  = "var(--font-geist-mono), 'Courier New', monospace"

export type FunnelTier = { label: string; count: number; pctOfTotal: number }

// Horizontal geometry -- MAX_W/VBW ratio controls how much of the width the
// funnel itself takes up vs. the reserved outside-label column on the right.
const VBW = 1150
const CENTER_X = 360 // off-center: right side reserved for outside leader-line labels
const MAX_W = 640
const FLOOR_PX = 3 // absolute-pixel floor so an exact-0% tier still renders a visible sliver instead of vanishing -- never large enough to distort any real ratio

// Vertical geometry -- doubled again per feedback ("double the funnel size")
const BAND_H = 230
const BAND_GAP = 32

// Two font scales: INSIDE text is constrained by the band's own (data-driven)
// width, so it stays modest; OUTSIDE text sits in the unconstrained label
// column, so it can go much bigger without any overflow risk. INSIDE fonts
// doubled per feedback ("TOTAL STOCKS ###%" text was still hard to read).
const INSIDE_LABEL_FONT = 44
const INSIDE_VALUE_FONT = 36
const OUTSIDE_LABEL_FONT = 32
const OUTSIDE_VALUE_FONT = 26
const INSIDE_LABEL_THRESHOLD = 320 // band bottom width below this can't fit INSIDE_LABEL_FONT text -> label moves outside

// width IS the percentage, directly -- no floor/offset that would inflate a
// small tier's width relative to a big one. 498 stocks and 29 stocks must be
// in the same 498:29 ratio on screen as they are in the data.
function widthForPct(pct: number) {
  return Math.max(MAX_W * (pct / 100), FLOOR_PX)
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

  const topMargin = 32
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
                <text x={CENTER_X} y={midY - 18} textAnchor="middle" fontSize={INSIDE_LABEL_FONT} fontWeight="bold" fill={i === 3 ? '#001a08' : GREEN} letterSpacing="0.05em">
                  {tier.label}
                </text>
                <text x={CENTER_X} y={midY + 34} textAnchor="middle" fontSize={INSIDE_VALUE_FONT} fill={i === 3 ? 'rgba(0,26,8,0.7)' : 'rgba(0,255,65,0.7)'}>
                  {tier.count.toLocaleString()} ({tier.pctOfTotal}%)
                </text>
              </>
            ) : (
              <>
                <line x1={edgeMidX} y1={midY} x2={outsideLabelX - 14} y2={midY} stroke="rgba(0,255,65,0.55)" strokeWidth={2} />
                <circle cx={edgeMidX} cy={midY} r={5} fill={GREEN} />
                <text x={outsideLabelX} y={midY - 10} fontSize={OUTSIDE_LABEL_FONT} fontWeight="bold" fill={GREEN} letterSpacing="0.05em">
                  {tier.label}
                </text>
                <text x={outsideLabelX} y={midY + 24} fontSize={OUTSIDE_VALUE_FONT} fill="rgba(0,255,65,0.7)">
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
