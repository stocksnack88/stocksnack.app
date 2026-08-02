const GREEN = '#00ff41'
const FONT  = "var(--font-geist-mono), 'Courier New', monospace"

export type FunnelTier = { label: string; count: number; pctOfTotal: number }

const VBW = 840
const CENTER_X = 310 // off-center: right side reserved for outside leader-line labels
const MAX_W = 540
const MIN_W = 70
const FLOOR_PCT = 4 // visual-only floor so a near-zero tier still renders a sliver; never affects the displayed number
const BAND_H = 60
const BAND_GAP = 8
const INSIDE_LABEL_THRESHOLD = 150 // band bottom width below this can't fit text -> label moves outside

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

  const totalH = tiers.length * BAND_H + (tiers.length - 1) * BAND_GAP + 20
  const outsideLabelX = CENTER_X + MAX_W / 2 + 40

  return (
    <svg viewBox={`0 0 ${VBW} ${totalH}`} width="100%" role="img" style={{ fontFamily: FONT }}>
      <title>Signal funnel: {tiers.map(t => `${t.label} ${t.count} (${t.pctOfTotal}%)`).join(', ')}</title>
      {tiers.map((tier, i) => {
        const top = 10 + i * (BAND_H + BAND_GAP)
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
              strokeWidth={1}
            />
            {inside ? (
              <>
                <text x={CENTER_X} y={midY - 6} textAnchor="middle" fontSize={13} fontWeight="bold" fill={i === 3 ? '#001a08' : GREEN} letterSpacing="0.05em">
                  {tier.label}
                </text>
                <text x={CENTER_X} y={midY + 13} textAnchor="middle" fontSize={12} fill={i === 3 ? 'rgba(0,26,8,0.7)' : 'rgba(0,255,65,0.7)'}>
                  {tier.count.toLocaleString()} ({tier.pctOfTotal}%)
                </text>
              </>
            ) : (
              <>
                <line x1={edgeMidX} y1={midY} x2={outsideLabelX - 10} y2={midY} stroke="rgba(0,255,65,0.55)" strokeWidth={1} />
                <circle cx={edgeMidX} cy={midY} r={2.5} fill={GREEN} />
                <text x={outsideLabelX} y={midY - 4} fontSize={12} fontWeight="bold" fill={GREEN} letterSpacing="0.05em">
                  {tier.label}
                </text>
                <text x={outsideLabelX} y={midY + 13} fontSize={12} fill="rgba(0,255,65,0.7)">
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
