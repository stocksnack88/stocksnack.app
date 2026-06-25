/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import React, { useState } from 'react'
import { playClick } from '@/lib/sounds'
import BackButton from '@/components/ui/BackButton'
import DescriptionToggle from '@/components/ui/DescriptionToggle'
import HealthCategories, { type FundRow as HealthFundRow } from '@/components/ui/HealthCategories'
import HazardTooltip from '@/components/ui/HazardTooltip'
import ShareButton from '@/components/ui/ShareButton'
import BlockShareButton from '@/components/ui/BlockShareButton'
import { LayerProvider, CollapsibleLayer, CollapsibleSectionHeader, ExpandCollapseButton, ChildCollapsibleLayer, ConnectedSegmentBreakdown, MethodologyToggle } from '@/components/ui/LayersAccordion'

type HealthCheck = {
  name: string
  pass: boolean
  score: number
  years_passed: number
  not_scored?: boolean
}

export interface TickerPageProps {
  ticker: string
  stock: Record<string, any> | null
  price: Record<string, any> | null
  score: Record<string, any> | null
  fundamentals: Record<string, any>[]
  healthCats: Array<{ label: string; count: number; checks: HealthCheck[] }>
  scoredTotal: number
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  const abs = Math.abs(n)
  const decimals = abs < 10 ? 2 : abs < 100 ? 1 : 0
  return `${n.toFixed(decimals)}%`
}

function fmtDollar(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  const abs = Math.abs(n)
  if (abs < 10) return `$${n.toFixed(2)}`
  if (abs < 100) return `$${n.toFixed(1)}`
  return `$${Math.round(n).toLocaleString("en-US")}`
}

function fmtCagr(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  return fmtPct(n * 100)
}

function fmtBn(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  const bn = n / 1_000_000_000
  if (Math.abs(bn) >= 100) return `$${Math.round(bn).toLocaleString("en-US")}bn`
  if (Math.abs(bn) >= 10)  return `$${bn.toFixed(1)}bn`
  return `$${bn.toFixed(2)}bn`
}

function scoreColor(v: number | null | undefined): string {
  if (!v && v !== 0) return "#666"
  return v >= 70 ? "#00ff41" : v >= 45 ? "#f59e0b" : "#ef4444"
}

function healthColor(v: number | null | undefined): string {
  if (v == null) return "#666"
  return v >= 75 ? "#00ff41" : v >= 50 ? "#f59e0b" : "#ef4444"
}

function SignalBadge({ signal }: { signal: string | null | undefined }) {
  const s = (signal ?? "").toUpperCase()
  const map: Record<string, React.CSSProperties> = {
    "BUY+": { background: "rgba(0,255,65,0.25)", color: "#00ff41", border: "1px solid rgba(0,255,65,0.9)" },
    BUY:   { background: "rgba(0,255,65,0.15)", color: "#00ff41", border: "1px solid rgba(0,255,65,0.6)" },
    HOLD:  { background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.5)" },
    SELL:  { background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.5)" },
  }
  return (
    <span
      className="inline-block px-3 py-1 rounded text-sm font-bold tracking-widest"
      style={map[s] ?? { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
    >
      {s || "—"}
    </span>
  )
}

const mono = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }

function cagrToScore(cagrValue: number | null, sp500Cagr: number): number {
  if (cagrValue === null) return 50.0
  const base = Math.max(sp500Cagr, 0.01)
  const cap = base * 2.0
  const midpoint = base
  const floor = -base
  const c = cagrValue
  if (c >= cap) return 100.0
  if (c >= midpoint) return 50.0 + (c - midpoint) / (cap - midpoint) * 50.0
  if (c >= 0.0) return 35.0 + (c / midpoint) * 15.0
  if (c >= floor) return Math.max(0.0, (c - floor) / (0.0 - floor) * 35.0)
  return 0.0
}

function deriveSignal(ppmCagr: number, sp500Cagr: number, healthPasses: number, growthScore: number): string {
  if (ppmCagr < sp500Cagr) return "SELL"
  if (ppmCagr < sp500Cagr * 1.2) return "HOLD"
  const hOk = healthPasses >= 16
  const gOk = growthScore >= 40
  if (hOk && gOk) return ppmCagr >= sp500Cagr * 1.5 ? "BUY+" : "BUY"
  if (hOk || gOk) return "HOLD"
  return "SELL"
}

export default function TickerPageContent({ ticker, stock, price, score, fundamentals, healthCats, scoredTotal }: TickerPageProps) {
  const [m1Mode, setM1Mode] = useState(false)

  const currentPrice: number | null = price?.current_price ?? null
  const blendedPrice: number | null = score?.ppm_blended_price ?? null

  // Cumulative dividend income over 5 years (per share)
  const cumDivPs: number = (() => {
    const db = score?.m_cumulative_div_ps != null ? Number(score.m_cumulative_div_ps) : 0
    if (db > 0) return db
    const yld = score?.div_yield_5y_avg != null ? Number(score.div_yield_5y_avg)
               : score?.div_yield != null ? Number(score.div_yield) : 0
    return yld > 0 && currentPrice ? currentPrice * yld * 5 : 0
  })()

  // Total return price = price target + cumulative dividends
  const totalReturnPrice: number | null = blendedPrice != null ? blendedPrice + cumDivPs : null

  // ShareButton always shows total return
  const totalReturnMult = totalReturnPrice != null && currentPrice != null && currentPrice > 0
    ? totalReturnPrice / currentPrice : null
  const totalReturnCagr = totalReturnMult != null ? Math.pow(totalReturnMult, 0.2) - 1 : null

  const shareProps = {
    ticker,
    companyName: stock?.name ?? null,
    signal: score?.signal ?? null,
    projectedReturn: totalReturnMult,
    cagr: totalReturnCagr,
  }

  // M1 derived values
  const sp500Cagr = score?.sp500_cagr != null ? Number(score.sp500_cagr) : null
  const m1PriceNum = score?.ppm_m1_price != null ? Number(score.ppm_m1_price) : null
  const m1Available = m1PriceNum != null && m1PriceNum > 0 && currentPrice != null && currentPrice > 0
  // M1 total return includes dividends too
  const m1TotalReturnPrice = m1Available ? m1PriceNum! + cumDivPs : null
  const m1Cagr = m1TotalReturnPrice != null && currentPrice != null
    ? Math.pow(m1TotalReturnPrice / currentPrice, 0.2) - 1 : null
  const m1PpmScore = (m1Cagr != null && sp500Cagr != null) ? cagrToScore(m1Cagr, sp500Cagr) : null
  const growthScore = score?.growth_score != null ? Number(score.growth_score) : 0
  const healthScore = score?.health_score != null ? Number(score.health_score) : 0
  const healthPasses = score?.health_passes != null ? Number(score.health_passes) : 0
  const m1FinalScore = m1PpmScore != null ? m1PpmScore * 0.40 + growthScore * 0.30 + healthScore * 0.30 : null
  const m1Signal = (m1Cagr != null && sp500Cagr != null) ? deriveSignal(m1Cagr, sp500Cagr, healthPasses, growthScore) : null

  // Display values — switch when M1 mode active
  // displayPrice stays as the price target (not total return) — used for the $ figure shown
  const displayPrice = m1Mode && m1PriceNum != null ? m1PriceNum : blendedPrice
  // displayCagr now reflects total return (price + dividends)
  const displayCagr = m1Mode && m1Cagr != null ? m1Cagr : totalReturnCagr
  // displayReturnMult: total return multiplier shown on arrow graphic and scorecard
  const displayTotalReturnPrice = displayPrice != null ? displayPrice + cumDivPs : null
  const displayReturnMult = displayTotalReturnPrice != null && currentPrice != null && currentPrice > 0
    ? displayTotalReturnPrice / currentPrice : null
  const displayPpmScore = m1Mode && m1PpmScore != null ? m1PpmScore : (score?.ppm_score != null ? Number(score.ppm_score) : null)
  const displayFinalScore = m1Mode && m1FinalScore != null ? m1FinalScore : (score?.final_score != null ? Number(score.final_score) : null)
  const displaySignal = m1Mode && m1Signal != null ? m1Signal : (score?.signal ?? null)

  return (
    <div className="bg-black" style={mono}>
      {/* Breadcrumb */}
      <div className="border-b px-6 py-3" style={{ borderColor: "rgba(0,255,65,0.1)" }}>
        <BackButton />
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* ── Company header ──────────────────────────────────────────────────── */}
        <div data-tour-id="ticker-header" className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <h1 className="text-3xl font-bold tracking-[0.2em]" style={{ color: "#00ff41" }}>
                {ticker}
              </h1>
              <SignalBadge signal={displaySignal} />
              {m1Mode && m1Signal && (
                <span
                  className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest"
                  style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.5)" }}
                >
                  EBITDA ONLY
                </span>
              )}
              {score?.has_anomaly && (
                <HazardTooltip
                  reasons={(score.anomaly_reasons ?? "").split(", ").filter(Boolean)}
                />
              )}
            </div>
            <p className="text-sm mb-1" style={{ color: "rgba(0,255,65,0.7)" }}>
              {stock?.name ?? "—"}
            </p>
            <p className="text-xs tracking-wide" style={{ color: "rgba(0,255,65,0.4)" }}>
              {[stock?.sector, stock?.industry, stock?.exchange].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        {/* ── Overview + Layers 1–5 ───────────────────────────────────────────── */}
        <LayerProvider count={14} briefExpand={{ startMs: 400, durationMs: 800 }} defaultOpenIds={[5, 12, 13]} childMap={{ 0: [6, 7, 8, 12, 13], 1: [9, 10, 11] }}>
          <div className="flex items-center justify-end gap-2">
            <ShareButton
              ticker={ticker}
              companyName={stock?.name ?? null}
              signal={score?.signal ?? null}
              projectedReturn={totalReturnMult}
              cagr={totalReturnCagr}
              growthScore={score?.growth_score != null ? Number(score.growth_score) : null}
              healthPasses={score?.health_passes ?? null}
              scoredTotal={scoredTotal}
              finalScore={score?.final_score != null ? Number(score.final_score) : null}
            />
            <ExpandCollapseButton />
          </div>

          {/* Overview */}
          <CollapsibleSectionHeader id={0} label="OVERVIEW" shareButton={<BlockShareButton captureIds={['capture-6', 'capture-7']} mode="stitch" fileName={`${ticker}-overview`} blockTitle="OVERVIEW" {...shareProps} />}>

          {/* Price projection */}
          <ChildCollapsibleLayer id={6} header={
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>PRICE PROJECTION</p>
          } shareButton={<BlockShareButton captureIds={['capture-6']} mode="single" fileName={`${ticker}-price-projection`} blockTitle="PRICE PROJECTION" {...shareProps} />}>
          <div className="px-5 py-4" id="capture-6" data-tour-id="price-projection-data">
            <p className="text-[11px] font-bold tracking-widest mb-3" style={{ color: "#00ff41" }}>{ticker} Price In 5 Years (Projected)</p>
            <div className="flex items-center gap-4">
              <div className="flex-1 text-center">
                <p className="text-xs tracking-widest mb-1" style={{ color: "rgba(0,255,65,0.4)" }}>CURRENT PRICE</p>
                <p className="text-2xl font-bold font-mono" style={{ color: "#00ff41" }}>
                  {fmtDollar(currentPrice)}
                </p>
              </div>
              <div className="flex flex-col items-center justify-center shrink-0">
                <svg width="88" height="60" viewBox="0 0 88 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {displayCagr != null && (
                    <text x="44" y="13" textAnchor="middle" fontSize="8" fontWeight="bold" letterSpacing="1.2" fill="rgba(0,255,65,0.7)">
                      {fmtCagr(displayCagr)} CAGR
                    </text>
                  )}
                  <line x1="2" y1="30" x2="70" y2="30" stroke="rgba(0,255,65,0.55)" strokeWidth="1.5" strokeDasharray="4,3"/>
                  <polygon points="80,30 68,24 68,36" fill="rgba(0,255,65,0.55)"/>
                  {displayReturnMult != null && (
                    <text x="44" y="50" textAnchor="middle" fontSize="8" fontWeight="bold" letterSpacing="1" fill="rgba(0,255,65,0.7)">
                      {displayReturnMult.toFixed(1)}x return
                    </text>
                  )}
                </svg>
              </div>
              <div className="flex-1 text-center">
                <p className="text-xs tracking-widest mb-1" style={{ color: "rgba(0,255,65,0.4)" }}>
                  {m1Mode ? "EBITDA-ONLY (5Y)" : "PROJECTED (5Y)"}
                </p>
                <p className="text-2xl font-bold font-mono" style={{ color: "#00ff41" }}>
                  {fmtDollar(displayPrice)}
                </p>
              </div>
            </div>
            {/* M1 toggle */}
            <div className="mt-3 pt-3 flex flex-col items-center gap-1.5" style={{ borderTop: "1px solid rgba(0,255,65,0.08)" }}>
              {m1Available ? (
                <>
                  <button
                    type="button"
                    onClick={() => { playClick(); setM1Mode(v => !v) }}
                    aria-pressed={m1Mode}
                    className="text-[10px] font-mono font-bold tracking-widest px-3 py-1 rounded-full border transition-all duration-200"
                    style={{
                      background: m1Mode ? "rgba(245,158,11,0.12)" : "#00ff41",
                      borderColor: m1Mode ? "rgba(245,158,11,0.55)" : "#00ff41",
                      color: m1Mode ? "#f59e0b" : "#001a08",
                      boxShadow: m1Mode ? "none" : "0 0 14px rgba(0,255,65,0.32)",
                    }}
                  >
                    {m1Mode ? "◀ BLENDED VIEW" : "TRY EBITDA-ONLY VIEW →"}
                  </button>
                  {m1Mode && (
                    <p className="text-[10px] font-mono text-center" style={{ color: "rgba(245,158,11,0.5)" }}>
                      Viewing: EBITDA-only price target (FCF method excluded)
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[10px] font-mono" style={{ color: "rgba(0,255,65,0.2)" }}>M1 unavailable for this ticker</p>
              )}
            </div>
          </div>
          </ChildCollapsibleLayer>

          {/* ── Scorecard ────────────────────────────────────────────────────── */}
          <ChildCollapsibleLayer id={7} header={
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>WHAT YOU ARE BUYING</p>
          } shareButton={<BlockShareButton captureIds={['capture-7']} mode="single" fileName={`${ticker}-scorecard`} blockTitle="WHAT YOU ARE BUYING" {...shareProps} />}>
          <div id="capture-7" data-tour-id="scorecard-data">
          {(() => {
            // 5Y RETURN color — uses total return (price + dividends)
            const stockMult = displayReturnMult
            const sp500Mult = score?.sp500_5y_return != null ? Number(score.sp500_5y_return) : null
            const multDiff  = stockMult != null && sp500Mult != null ? stockMult - sp500Mult : null
            const multColor = multDiff == null ? "#00ff41"
              : Math.abs(multDiff) <= 0.1 ? "#f59e0b"
              : multDiff > 0 ? "#00ff41" : "#ef4444"
            // CAGR color
            const ppmCagrN   = displayCagr
            const sp500CagrN = score?.sp500_cagr != null ? Number(score.sp500_cagr) : null
            const cagrDiff   = ppmCagrN != null && sp500CagrN != null ? ppmCagrN - sp500CagrN : null
            const cagrColor  = cagrDiff == null ? "#00ff41"
              : Math.abs(cagrDiff) <= 0.01 ? "#f59e0b"
              : cagrDiff > 0 ? "#00ff41" : "#ef4444"
            // Growth Quality color
            const gq = score?.growth_score != null ? Number(score.growth_score) : null
            const gqColor = gq == null ? "#00ff41" : gq >= 75 ? "#00ff41" : gq >= 50 ? "#f59e0b" : "#ef4444"
            // Financial Health color
            const hp = score?.health_passes != null ? Number(score.health_passes) : null
            const healthRatio = hp != null ? hp / scoredTotal : null
            const healthColor2 = healthRatio == null ? "#00ff41"
              : healthRatio >= 0.75 ? "#00ff41" : healthRatio >= 0.50 ? "#f59e0b" : "#ef4444"
            return ([
              {
                label: "5Y RETURN VS S&P 500",
                value: (
                  <span className="font-mono font-bold text-sm">
                    <span style={{ color: multColor }}>
                      {stockMult != null ? `${stockMult.toFixed(1)}x` : "—"}
                    </span>
                    <span className="mx-2" style={{ color: "rgba(0,255,65,0.3)" }}>vs</span>
                    <span style={{ color: "rgba(0,255,65,0.4)" }}>
                      {sp500Mult != null ? `${sp500Mult.toFixed(1)}x` : "—"}
                    </span>
                  </span>
                ),
              },
              {
                label: "CAGR (5Y) VS S&P 500",
                value: (
                  <span className="font-mono font-bold text-sm">
                    <span style={{ color: cagrColor }}>{fmtCagr(displayCagr)}</span>
                    <span className="mx-2" style={{ color: "rgba(0,255,65,0.3)" }}>vs</span>
                    <span style={{ color: "rgba(0,255,65,0.4)" }}>
                      {sp500CagrN != null ? fmtCagr(score?.sp500_cagr) : "—"}
                    </span>
                  </span>
                ),
              },
              {
                label: "GROWTH QUALITY",
                value: (
                  <span className="font-mono font-bold text-sm" style={{ color: gqColor }}>
                    {gq != null ? fmtPct(gq) : "—"}
                  </span>
                ),
              },
              {
                label: "FINANCIAL HEALTH",
                value: (
                  <span className="whitespace-nowrap">
                    {hp != null ? (
                      <>
                        <span className="font-mono font-bold text-sm" style={{ color: healthColor2 }}>{hp} / {scoredTotal}</span>
                        <span className="text-[9px]" style={{ color: "rgba(0,255,65,0.5)" }}> CHECKS PASSED</span>
                      </>
                    ) : "—"}
                  </span>
                ),
              },
            ] as const).map(({ label, value }, i) => (
              <div
                key={label}
                className="flex items-center justify-between px-5 py-3 gap-4"
                style={i < 3 ? { borderBottom: "1px solid rgba(0,255,65,0.1)" } : {}}
              >
                <p className="text-xs tracking-widest shrink-0" style={{ color: "rgba(0,255,65,0.4)" }}>{label}</p>
                {value}
              </div>
            ))
          })()}
          </div>
          </ChildCollapsibleLayer>

          {/* ── About the Business ──────────────────────────────────────────────── */}
          <ChildCollapsibleLayer id={8} header={
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>ABOUT THE BUSINESS</p>
          } shareButton={<BlockShareButton captureIds={['capture-8-product', 'capture-8-geo']} mode="multi" fileName={`${ticker}-segments`} blockTitle="ABOUT THE BUSINESS" {...shareProps} />}>
          {(() => {
          const rawProduct = score?.product_segments
          const rawGeo     = score?.geo_segments
          type Segment = { name: string; pct: number; cagr: number | null; value: number }
          const productSegs: Segment[] = Array.isArray(rawProduct) ? rawProduct : []
          const geoSegs: Segment[]     = Array.isArray(rawGeo)     ? rawGeo     : []
          if (!stock?.description && !productSegs.length && !geoSegs.length) return null
          return (
            <div data-tour-id="business-data">
              {stock?.description && (
                <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
                  <p className="text-xs font-bold tracking-widest mb-3" style={{ color: "rgba(0,255,65,0.4)" }}>COMPANY DESCRIPTION</p>
                  <DescriptionToggle text={stock.description} />
                </div>
              )}
              {productSegs.length > 0 && (
                <div id="capture-8-product">
                  <ConnectedSegmentBreakdown
                    id={12}
                    title="PRODUCT BREAKDOWN"
                    segs={productSegs}
                    borderedBottom={geoSegs.length > 0}
                  />
                </div>
              )}
              {geoSegs.length > 0 && (
                <div id="capture-8-geo">
                  <ConnectedSegmentBreakdown id={13} title="GEOGRAPHIC BREAKDOWN" segs={geoSegs} />
                </div>
              )}
            </div>
          )
          })()}
          <p className="text-center text-xs py-4 tracking-wide" style={{ color: "rgba(0,255,65,0.2)", borderTop: "1px solid rgba(0,255,65,0.1)" }}>
            DATA · FINANCIALMODELINGPREP · SCORES UPDATED WEEKLY
          </p>
          </ChildCollapsibleLayer>
          </CollapsibleSectionHeader>

          {/* Market Comparison */}
          <CollapsibleSectionHeader id={1} label="MARKET COMPARISON" shareButton={<BlockShareButton captureIds={['capture-9', 'capture-10', 'capture-11']} mode="multi" fileName={`${ticker}-market`} blockTitle="MARKET COMPARISON" {...shareProps} />}>
          {(() => {
          const peRatio      = score?.pe_ratio          != null ? Number(score.pe_ratio)          : null
          const pe5yAvg      = score?.pe_5y_avg          != null ? Number(score.pe_5y_avg)          : null
          const industryPe   = score?.industry_pe        != null ? Number(score.industry_pe)        : null
          const industryPe5y = score?.industry_pe_5y_avg != null ? Number(score.industry_pe_5y_avg) : null
          const fcfYield       = score?.fcf_yield           != null ? Number(score.fcf_yield)           : null
          const fcf5yAvg       = score?.fcf_5y_avg          != null ? Number(score.fcf_5y_avg)          : null
          const industryFcf    = score?.industry_fcf_yield     != null ? Number(score.industry_fcf_yield)     : null
          const industryFcf5y  = score?.industry_fcf_5y_avg   != null ? Number(score.industry_fcf_5y_avg)   : null
          const divYield       = score?.div_yield              != null ? Number(score.div_yield)              : null
          const div5yAvg       = score?.div_yield_5y_avg       != null ? Number(score.div_yield_5y_avg)       : null
          const industryDiv    = score?.industry_div_yield     != null ? Number(score.industry_div_yield)     : null
          const industryDiv5y  = score?.industry_div_yield_5y_avg != null ? Number(score.industry_div_yield_5y_avg) : null

          const SP500_PE_NOW = 22;    const SP500_PE_5Y  = 19
          const SP500_FCF_NOW = 0.035; const SP500_FCF_5Y  = 0.032
          const SP500_DIV_NOW = 0.013; const SP500_DIV_5Y  = 0.018

          const fmtPe  = (n: number | null) => n != null ? `${n.toFixed(1)}x`         : "—"
          const fmtYld = (n: number | null) => n != null ? `${(n * 100).toFixed(2)}%` : "—"

          type BarGroup = { label: string; cur: number | null; avg: number | null; isStock?: boolean }

          function renderBarChart(groups: BarGroup[], stockNow: number | null, fmt: (n: number | null) => string) {
            if (stockNow == null) return null
            const allVals = groups.flatMap(g => [g.cur, g.avg]).filter((v): v is number => v != null && v > 0)
            const maxVal  = allVals.length > 0 ? Math.max(...allVals) : 0

            const H      = 90
            const BAR_W  = 14
            const BAR_GAP = 4
            const GRP_GAP = 20
            const AXIS_W  = 32

            const px = (v: number | null) => v != null && v > 0 ? Math.round((v / maxVal) * H) : 0
            const refPx = Math.round((stockNow / maxVal) * H)
            const yTicks = [0, 0.25, 0.5, 0.75, 1.0]

            return (
              <div style={{ fontFamily: "var(--font-geist-mono),'Courier New',monospace", userSelect: "none" }}>
                <div style={{ display: "flex" }}>
                  <div style={{ width: AXIS_W, height: H, position: "relative", flexShrink: 0 }}>
                    {yTicks.map(f => (
                      <span key={f} style={{
                        position: "absolute", right: 4, bottom: `${f * 100}%`,
                        transform: "translateY(50%)", fontSize: 8,
                        color: "rgba(0,255,65,0.28)", whiteSpace: "nowrap", lineHeight: 1,
                      }}>
                        {fmt(maxVal * f)}
                      </span>
                    ))}
                  </div>
                  <div style={{ flex: 1, height: H, position: "relative" }}>
                    {yTicks.map(f => (
                      <div key={f} style={{
                        position: "absolute", left: 0, right: 0, bottom: `${f * 100}%`, height: 1,
                        background: f === 0 ? "rgba(0,255,65,0.25)" : "rgba(0,255,65,0.07)",
                      }} />
                    ))}
                    <div style={{
                      position: "absolute", left: 0, right: 0, bottom: refPx,
                      borderTop: "1px dashed rgba(0,255,65,0.65)", zIndex: 2,
                    }}>
                      <span style={{
                        position: "absolute", right: 2, top: -13,
                        fontSize: 8, color: "rgba(0,255,65,0.65)", whiteSpace: "nowrap",
                      }}>
                        STOCK NOW — {fmt(stockNow)}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", height: "100%", gap: GRP_GAP, paddingLeft: 4, paddingRight: 4 }}>
                      {groups.map(g => {
                        const isStock    = g.isStock ?? false
                        const curColor   = isStock ? "#00ff41"
                          : (g.cur != null && g.cur > stockNow ? "#ef4444" : "#00ff41")
                        const avgColor   = isStock ? "rgba(0,255,65,0.28)"
                          : (g.avg != null && g.avg > stockNow ? "rgba(239,68,68,0.28)" : "rgba(0,255,65,0.28)")
                        return (
                          <div key={g.label} style={{ display: "flex", alignItems: "flex-end", gap: BAR_GAP, flexShrink: 0 }}>
                            <div style={{ width: BAR_W, height: px(g.cur),  background: curColor }} />
                            <div style={{ width: BAR_W, height: px(g.avg),  background: avgColor }} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", paddingLeft: AXIS_W + 4, gap: GRP_GAP, marginTop: 5 }}>
                  {groups.map(g => (
                    <div key={g.label} style={{
                      width: BAR_W * 2 + BAR_GAP, textAlign: "center",
                      fontSize: 8, color: "rgba(0,255,65,0.38)",
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {g.label}
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          function calcBadge(cur: number | null, them: number | null, inverse: boolean) {
            if (cur == null || them == null) return null
            if (inverse) {
              if (cur > them * 1.1) return { label: "CHEAPER",   color: "#00ff41" }
              if (cur < them * 0.9) return { label: "EXPENSIVE", color: "#ef4444" }
              return                       { label: "FAIR",      color: "#f59e0b" }
            }
            if (cur > them * 1.1)   return { label: "EXPENSIVE", color: "#ef4444" }
            if (cur < them * 0.9)   return { label: "CHEAPER",   color: "#00ff41" }
            return                         { label: "FAIR",      color: "#f59e0b" }
          }

          type TableRow = { label: string; them: number | null }

          function renderTable(
            current: number | null,
            fmt: (n: number | null) => string,
            rows: TableRow[],
            inverse: boolean,
          ) {
            const thStyle: React.CSSProperties = {
              fontSize: 9, color: "rgba(0,255,65,0.35)", fontFamily: "inherit",
              fontWeight: "normal", letterSpacing: "0.1em",
              paddingBottom: 6, borderBottom: "1px solid rgba(0,255,65,0.12)",
            }
            const tdStyle: React.CSSProperties = {
              fontSize: 11, fontFamily: "inherit",
              padding: "5px 0", borderBottom: "1px solid rgba(0,255,65,0.07)",
            }
            return (
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-geist-mono),'Courier New',monospace" }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: "left",   paddingRight: 8 }}>BENCHMARK</th>
                    <th style={{ ...thStyle, textAlign: "center"                  }}>CURRENT vs BENCHMARK</th>
                    <th style={{ ...thStyle, textAlign: "right",  paddingLeft: 8  }}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const b = calcBadge(current, r.them, inverse)
                    const isLast = i === rows.length - 1
                    const noBottom = isLast ? { borderBottom: "none" } : {}
                    const cmpStr = (
                      <div style={{ display: "grid", gridTemplateColumns: "52px 24px 52px", gap: 0 }}>
                        <span style={{ textAlign: "right",  color: current != null ? "#00ff41" : "rgba(0,255,65,0.2)", fontWeight: 700 }}>{fmt(current)}</span>
                        <span style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 9 }}>vs</span>
                        <span style={{ textAlign: "left",   color: r.them  != null ? "rgba(0,255,65,0.5)" : "rgba(0,255,65,0.2)" }}>{fmt(r.them)}</span>
                      </div>
                    )
                    return (
                      <tr key={r.label}>
                        <td style={{ ...tdStyle, color: "rgba(0,255,65,0.45)", paddingRight: 8, whiteSpace: "nowrap", ...noBottom }}>{r.label}</td>
                        <td style={{ ...tdStyle, textAlign: "center", color: "#00ff41", ...noBottom }}>{cmpStr}</td>
                        <td style={{ ...tdStyle, textAlign: "right", paddingLeft: 8, ...noBottom }}>
                          {b
                            ? <span style={{ color: b.color, fontWeight: "bold", fontSize: 9, letterSpacing: "0.1em" }}>{b.label}</span>
                            : <span style={{ color: "rgba(0,255,65,0.2)" }}>—</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          }

          function getVerdict(current: number | null, rows: TableRow[], inverse: boolean, metricType: "pe" | "fcf" | "div"): string | null {
            if (current == null) return null
            const badges = rows.map(r => calcBadge(current, r.them, inverse)).filter(Boolean) as { label: string; color: string }[]
            if (badges.length === 0) return null
            if (metricType === "pe") {
              const exp   = badges.filter(b => b.label === "EXPENSIVE").length
              const cheap = badges.filter(b => b.label === "CHEAPER").length
              if (exp >= 3)   return "Priced at a premium — you're paying more than most benchmarks suggest it's worth."
              if (exp >= 2)   return "Slightly expensive compared to a few benchmarks — worth watching."
              if (cheap >= 3) return "Looks cheap across the board — could be a good entry point."
              if (cheap >= 2) return "Underpriced against a few benchmarks — potentially good value."
              return "Fairly priced — nothing screaming buy or sell here."
            } else if (metricType === "fcf") {
              const high = badges.filter(b => b.label === "CHEAPER").length
              const low  = badges.filter(b => b.label === "EXPENSIVE").length
              if (high >= 3)  return "Strong cash generation relative to price — the business is throwing off a lot of free cash."
              if (high >= 2)  return "Above-average FCF yield compared to a few benchmarks — decent cash returns."
              if (low >= 3)   return "Weak FCF yield across the board — not much cash being returned relative to what you're paying."
              if (low >= 2)   return "FCF yield trails a few benchmarks — moderate cash generation for the price."
              return "FCF yield is in line with what you'd expect — nothing unusual here."
            } else {
              const high = badges.filter(b => b.label === "CHEAPER").length
              const low  = badges.filter(b => b.label === "EXPENSIVE").length
              if (high >= 3)  return "High dividend yield across the board — stands out as an income play."
              if (high >= 2)  return "Pays more than a few benchmarks — solid income relative to price."
              if (low >= 3)   return "Low dividend yield across the board — not an income-focused stock."
              if (low >= 2)   return "Dividend yield is below a few benchmarks — modest income."
              return "Dividend yield is about average — nothing exceptional either way."
            }
          }

          function renderMetric(
            title: string,
            current: number | null,
            groups: BarGroup[],
            tableRows: TableRow[],
            fmt: (n: number | null) => string,
            inverse: boolean,
            metricType: "pe" | "fcf" | "div",
            id: number,
            captureId: string,
          ) {
            const verdict = getVerdict(current, tableRows, inverse, metricType)
            return (
              <ChildCollapsibleLayer key={title} id={id} header={
                <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>{title}</p>
              } shareButton={<BlockShareButton captureIds={[captureId]} mode="single" fileName={`${ticker}-${captureId}`} blockTitle={title} {...shareProps} />}>
                <div id={captureId} className="px-5 py-5" style={{ fontFamily: "var(--font-geist-mono),'Courier New',monospace" }}>
                  {renderBarChart(groups, current, fmt)}
                  <div style={{ display: "flex", gap: 14, marginTop: 8, marginBottom: 16, fontSize: 8, color: "rgba(0,255,65,0.4)", letterSpacing: "0.1em" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#00ff41", flexShrink: 0 }} />
                      CURRENT
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "rgba(0,255,65,0.28)", flexShrink: 0 }} />
                      5Y AVG
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ display: "inline-block", width: 16, borderTop: "1px dashed rgba(0,255,65,0.65)", flexShrink: 0 }} />
                      STOCK NOW
                    </span>
                  </div>
                  <div style={{ height: 1, background: "rgba(0,255,65,0.1)", marginBottom: 14 }} />
                  {renderTable(current, fmt, tableRows, inverse)}
                  {verdict && (
                    <p style={{ marginTop: 10, fontSize: 11, color: "rgba(0,255,65,0.5)", lineHeight: 1.5 }}>
                      {verdict}
                    </p>
                  )}
                </div>
              </ChildCollapsibleLayer>
            )
          }

          return (
            <>
              {renderMetric(
                "P/E RATIO ANALYSIS", peRatio,
                [
                  { label: "STOCK",    cur: peRatio,      avg: pe5yAvg,      isStock: true },
                  { label: "INDUSTRY", cur: industryPe,   avg: industryPe5y  },
                  { label: "S&P 500",  cur: SP500_PE_NOW, avg: SP500_PE_5Y   },
                ],
                [
                  { label: `${ticker} 5Y Avg`,   them: pe5yAvg       },
                  { label: "Industry Now",        them: industryPe    },
                  { label: "Industry 5Y Avg",     them: industryPe5y  },
                  { label: "S&P 500 Now",         them: SP500_PE_NOW  },
                  { label: "S&P 500 5Y Avg",      them: SP500_PE_5Y   },
                ],
                fmtPe, false, "pe", 9, "capture-9",
              )}
              {renderMetric(
                "FCF YIELD ANALYSIS", fcfYield,
                [
                  { label: "STOCK",    cur: fcfYield,      avg: fcf5yAvg,     isStock: true },
                  { label: "INDUSTRY", cur: industryFcf,   avg: industryFcf5y ?? 0 },
                  { label: "S&P 500",  cur: SP500_FCF_NOW, avg: SP500_FCF_5Y  },
                ],
                [
                  { label: `${ticker} 5Y Avg`,   them: fcf5yAvg      },
                  { label: "Industry Now",        them: industryFcf   },
                  { label: "Industry 5Y Avg",     them: industryFcf5y },
                  { label: "S&P 500 Now",         them: SP500_FCF_NOW },
                  { label: "S&P 500 5Y Avg",      them: SP500_FCF_5Y  },
                ],
                fmtYld, true, "fcf", 10, "capture-10",
              )}
              {renderMetric(
                "DIVIDEND YIELD ANALYSIS", divYield,
                [
                  { label: "STOCK",    cur: divYield,      avg: div5yAvg,     isStock: true },
                  { label: "INDUSTRY", cur: industryDiv,   avg: industryDiv5y ?? 0 },
                  { label: "S&P 500",  cur: SP500_DIV_NOW, avg: SP500_DIV_5Y  },
                ],
                [
                  { label: `${ticker} 5Y Avg`,   them: div5yAvg      },
                  { label: "Industry Now",        them: industryDiv   },
                  { label: "Industry 5Y Avg",     them: industryDiv5y },
                  { label: "S&P 500 Now",         them: SP500_DIV_NOW },
                  { label: "S&P 500 5Y Avg",      them: SP500_DIV_5Y  },
                ],
                fmtYld, true, "div", 11, "capture-11",
              )}
            </>
          )
          })()}
          </CollapsibleSectionHeader>

          {/* Layer 1: PPM */}
          <CollapsibleLayer id={2} header={(
            <>
              <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>
                LAYER 1 — HOW WE PROJECT THE PRICE
              </p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(0,255,65,0.4)" }}>
                3 independent methods blended into a single 5-year price target
              </p>
            </>
          )} shareButton={<BlockShareButton captureIds={['capture-2']} mode="single" fileName={`${ticker}-layer1`} blockTitle="LAYER 1 — HOW WE PROJECT THE PRICE" {...shareProps} />}>
          <div id="capture-2">
          {/* Compact summary row */}
          <p className="text-center text-[9px] font-mono tracking-widest py-2.5" style={{ color: "rgba(0,255,65,0.45)", borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
            {displayCagr != null ? `~${(displayCagr * 100).toFixed(1)}% PER YEAR` : "—"}
            {" · "}
            {displayReturnMult != null ? `~${displayReturnMult.toFixed(1)}x RETURN` : "—"}
          </p>

          <MethodologyToggle>
          {(() => {
            const m3na = score?.m3_applicable === false || !score?.ppm_m3_price || Number(score.ppm_m3_price) === 0 || (score?.m3_div_yield != null && Number(score.m3_div_yield) < 0.04)
            const m2na = !score?.ppm_m2_price || Number(score.ppm_m2_price) === 0
            const m2NotApplicableReason = (() => {
              const override = score?.sector_override
              if (override === 'Bank' || override === 'Financial') return 'FCF excluded for financial sector'
              if (override === 'REIT') return 'FCF not meaningful for REITs'
              if (score?.m2_fcf_current !== null && score?.m2_fcf_current !== undefined && Number(score.m2_fcf_current) < 0)
                return 'Negative FCF — capex exceeds operating cash'
              return 'Insufficient FCF data'
            })()
            const cumDivPs = score?.m_cumulative_div_ps != null ? Number(score.m_cumulative_div_ps) : 0
            const m3Shares = score?.m1_shares != null ? Number(score.m1_shares) : null
            const m3AnnualDivPs = cumDivPs > 0 ? cumDivPs / 5 : null
            const m3CurTotalDiv = m3AnnualDivPs != null && m3Shares != null ? m3AnnualDivPs * m3Shares : null
            const m3GrowthRate = score?.m3_growth_rate != null ? Number(score.m3_growth_rate) : null
            const m3Proj5yTotalDiv = m3CurTotalDiv != null && m3GrowthRate != null
              ? m3CurTotalDiv * Math.pow(1 + m3GrowthRate, 5) : null
            const isPeMode = ["PYPL", "HOOD"].includes(ticker)

            // 5-year cumulative dividend per share for ALL dividend payers.
            // DB field m_cumulative_div_ps is only populated for M3-applicable (yield ≥ 4.5%) stocks.
            // For the rest we approximate using the 5-year average yield × current price × 5 years.
            const divYield5yAvg = score?.div_yield_5y_avg != null ? Number(score.div_yield_5y_avg) : null
            const divYieldCur   = score?.div_yield      != null ? Number(score.div_yield)      : null
            const effectiveCumDivPs: number = (() => {
              if (cumDivPs > 0) return cumDivPs
              const yld = divYield5yAvg ?? divYieldCur ?? 0
              if (yld > 0 && currentPrice) return currentPrice * yld * 5
              return 0
            })()
            const hasDividend = effectiveCumDivPs > 0.01

            const m1Price = score?.ppm_m1_price ? Number(score.ppm_m1_price) : null
            const m2Price = !m2na && score?.ppm_m2_price ? Number(score.ppm_m2_price) : null
            const m3Price = !m3na && score?.ppm_m3_price ? Number(score.ppm_m3_price) : null

            // Total return = price target + cumulative dividends received over 5 years
            const m1Total = m1Price != null ? m1Price + effectiveCumDivPs : null
            const m2Total = m2Price != null ? m2Price + effectiveCumDivPs : null
            const m1Return = m1Total != null && currentPrice ? m1Total / currentPrice : null
            const m2Return = m2Total != null && currentPrice ? m2Total / currentPrice : null
            const m3Return = m3Price != null && currentPrice ? m3Price / currentPrice : null
            const m1Cagr = m1Return != null ? Math.pow(m1Return, 0.2) - 1 : null
            const m2Cagr = m2Return != null ? Math.pow(m2Return, 0.2) - 1 : null
            const m3Cagr = m3Return != null ? Math.pow(m3Return, 0.2) - 1 : null
            const sp500CagrVal = score?.sp500_cagr != null ? Number(score.sp500_cagr) : null

            const VB = "1px solid rgba(0,255,65,0.55)"

            const pct  = (v: unknown) => v != null ? `${(Number(v) * 100).toFixed(1)}%/yr` : "—"
            const mlt  = (v: unknown) => v != null ? `${Number(v).toFixed(1)}x` : "—"
            const yld  = (v: unknown) => v != null ? `${(Number(v) * 100).toFixed(2)}%` : "—"
            const retX = (r: number | null) => r != null ? `${r.toFixed(1)}x` : "—"
            const cagrP = (c: number | null) => c != null ? `${(c * 100).toFixed(1)}%` : "—"
            const vsSP = (c: number | null) => {
              if (c == null || sp500CagrVal == null) return "—"
              const d = c - sp500CagrVal
              return d >= 0 ? `+${(d * 100).toFixed(1)}%` : `${(d * 100).toFixed(1)}%`
            }
            const vsClr = (c: number | null) => {
              if (c == null || sp500CagrVal == null) return "rgba(0,255,65,0.45)"
              const d = c - sp500CagrVal
              return d > 0.01 ? "#00ff41" : d < -0.01 ? "#ef4444" : "#f59e0b"
            }

            const brt: React.CSSProperties = { color: "rgba(0,255,65,0.8)", fontWeight: "bold" }
            const mut: React.CSSProperties = { color: "rgba(0,255,65,0.28)", fontSize: "8px" }

            const lbl = (text: string) => (
              <td style={{
                padding: "1px 8px 1px 12px", position: "sticky", left: 0, zIndex: 1,
                background: "#0b0f0b", boxShadow: "1px 0 0 0 rgba(0,255,65,0.55)",
                color: "rgba(0,255,65,0.5)", fontSize: "10px", letterSpacing: "0.1em", whiteSpace: "nowrap",
              }}>{text}</td>
            )
            const cel = (node: React.ReactNode, tourId: string) => (
              <td data-tour-id={tourId} style={{ padding: "1px 8px", textAlign: "center" }}>{node}</td>
            )
            const bv = (t: React.ReactNode) => (
              <span style={{ ...brt, border: "1px solid #00ff41", padding: "2px 0", display: "inline-block", width: "72px", textAlign: "center", fontSize: "10px" }}>{t}</span>
            )
            const mv = (t: React.ReactNode) => <span style={mut}>{t}</span>
            const row = (style: React.CSSProperties, label: string, c1: React.ReactNode, c2: React.ReactNode, c3: React.ReactNode) => (
              <tr style={style}>{lbl(label)}{cel(c1, "method-1")}{cel(c2, "method-2")}{cel(c3, "method-3")}</tr>
            )
            const bvc = (t: React.ReactNode, color: string) => (
              <span style={{ border: `1px solid ${color}`, padding: "2px 0", display: "inline-block", width: "72px", textAlign: "center", fontSize: "10px", fontWeight: "bold", color }}>{t}</span>
            )
            const arrowRow = (c1 = "rgba(0,255,65,0.55)", c2 = c1, c3 = c1) => (
              <tr>
                <td style={{ padding: 0, position: "sticky", left: 0, zIndex: 1, background: "#0b0f0b", boxShadow: "1px 0 0 0 rgba(0,255,65,0.55)" }} />
                <td data-tour-id="method-1" style={{ textAlign: "center", padding: "0 8px", lineHeight: 1 }}>
                  <span style={{ color: c1, fontSize: "10px" }}>↓</span>
                </td>
                <td data-tour-id="method-2" style={{ textAlign: "center", padding: "0 8px", lineHeight: 1 }}>
                  {!m2na && <span style={{ color: c2, fontSize: "10px" }}>↓</span>}
                </td>
                <td data-tour-id="method-3" style={{ textAlign: "center", padding: "0 8px", lineHeight: 1 }}>
                  {!m3na && <span style={{ color: c3, fontSize: "10px" }}>↓</span>}
                </td>
              </tr>
            )

            return (
              <div data-tour-id="methodology-table" style={{ overflowX: "auto", paddingTop: "12px" }}>
                <table style={{ minWidth: "450px", width: "100%", borderCollapse: "collapse", fontFamily: "inherit" }}>
                  <colgroup>
                    <col style={{ width: "88px" }} />
                    <col /><col /><col />
                  </colgroup>
                  <thead>
                    <tr style={{ background: "#0d150d" }}>
                      <th rowSpan={2} style={{
                        padding: "6px 8px 6px 12px", position: "sticky", left: 0, zIndex: 2,
                        background: "#0d150d", boxShadow: "1px 0 0 0 rgba(0,255,65,0.55)",
                        textAlign: "center", verticalAlign: "middle",
                      }}>
                        <div style={{ color: "#00ff41", fontSize: "10px", fontWeight: "bold", letterSpacing: "0.08em" }}>STEPS</div>
                      </th>
                      <th data-tour-id="method-1" style={{ padding: "6px 8px 0", textAlign: "center" }}>
                        <div style={{ color: "rgba(0,255,65,0.3)", fontSize: "8px", letterSpacing: "0.12em" }}>METHOD 1</div>
                      </th>
                      <th data-tour-id="method-2" style={{ padding: "6px 8px 0", textAlign: "center", opacity: m2na ? 0.4 : 1 }}>
                        <div style={{ color: "rgba(0,255,65,0.3)", fontSize: "8px", letterSpacing: "0.12em" }}>METHOD 2</div>
                      </th>
                      <th data-tour-id="method-3" style={{ padding: "6px 8px 0", textAlign: "center", opacity: m3na ? 0.4 : 1 }}>
                        <div style={{ color: "rgba(0,255,65,0.3)", fontSize: "8px", letterSpacing: "0.12em" }}>METHOD 3</div>
                      </th>
                    </tr>
                    <tr style={{ background: "#0d150d", borderBottom: VB }}>
                      <th data-tour-id="method-1" style={{ padding: "2px 8px 6px", textAlign: "center" }}>
                        <div style={{ color: "#00ff41", fontSize: "10px", fontWeight: "bold", letterSpacing: "0.08em" }}>{isPeMode ? "P/E RATIO" : "EBITDA"}</div>
                      </th>
                      <th data-tour-id="method-2" style={{ padding: "2px 8px 6px", textAlign: "center", opacity: m2na ? 0.4 : 1 }}>
                        <div style={{ color: "#00ff41", fontSize: "10px", fontWeight: "bold", letterSpacing: "0.08em" }}>FREE CASH FLOW</div>
                      </th>
                      <th data-tour-id="method-3" style={{ padding: "2px 8px 6px", textAlign: "center", opacity: m3na ? 0.4 : 1 }}>
                        <div style={{ color: "#00ff41", fontSize: "10px", fontWeight: "bold", letterSpacing: "0.08em" }}>DIVIDENDS</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {row({}, "CURRENT PRICE",
                      bv(fmtDollar(currentPrice)),
                      m2na ? mv(m2NotApplicableReason) : bv(fmtDollar(currentPrice)),
                      m3na ? mv("Div yield < 4.5%") : bv(fmtDollar(currentPrice))
                    )}
                    {arrowRow()}
                    {row({}, "CURRENT VALUE",
                      bv(fmtBn(score?.m1_ebitda_current)),
                      m2na ? mv("—") : bv(fmtBn(score?.m2_fcf_current)),
                      m3na ? mv("—") : bv(yld(score?.m3_div_yield))
                    )}
                    {arrowRow()}
                    {row({}, "HIST. GROWTH (L5Y)",
                      bv(pct(score?.m1_growth_rate)),
                      m2na ? mv("—") : bv(pct(score?.fcf_cagr_5y)),
                      m3na ? mv("—") : bv(pct(score?.m3_growth_rate))
                    )}
                    {arrowRow()}
                    {row({}, "FUTURE VALUE (5Y)",
                      bv(fmtBn(score?.m1_ebitda_projected)),
                      m2na ? mv("—") : bv(fmtBn(score?.m2_fcf_projected)),
                      m3na ? mv("—") : bv(m3CurTotalDiv != null ? fmtBn(m3CurTotalDiv) : "—")
                    )}
                    {arrowRow()}
                    {row({}, isPeMode ? "P/E MULTIPLE" : "MULTIPLIER",
                      <><div style={{ color: "rgba(0,255,65,0.3)", fontSize: "7px", fontStyle: "italic", marginBottom: "2px" }}>{isPeMode ? "P/E" : "EV/EBITDA"}</div>{bv(mlt(score?.m1_ev_ebitda_multiple))}</>,
                      m2na ? mv("—") : <><div style={{ color: "rgba(0,255,65,0.3)", fontSize: "7px", fontStyle: "italic", marginBottom: "2px" }}>FCF Yield</div>{bv(yld(score?.m2_fcf_yield))}</>,
                      m3na ? mv("—") : <><div style={{ color: "rgba(0,255,65,0.3)", fontSize: "7px", fontStyle: "italic", marginBottom: "2px" }}>Div Yield</div>{bv(m3Proj5yTotalDiv != null ? fmtBn(m3Proj5yTotalDiv) : "—")}</>
                    )}
                    {arrowRow()}
                    <tr style={{ background: "rgba(0,255,65,0.03)" }}>
                      <td style={{
                        padding: "1px 8px 1px 12px", position: "sticky", left: 0, zIndex: 1,
                        background: "#111811", boxShadow: "1px 0 0 0 rgba(0,255,65,0.55)",
                        color: "rgba(0,255,65,0.5)", fontSize: "10px", letterSpacing: "0.1em",
                        fontWeight: "bold", whiteSpace: "nowrap",
                      }}>PRICE TARGET</td>
                      <td data-tour-id="method-1" style={{ padding: "1px 8px", textAlign: "center" }}>
                        <span style={{ display: "inline-block", background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.55)", width: "72px", padding: "2px 0", textAlign: "center", color: "#00ff41", fontSize: "10px", fontWeight: "bold" }}>{fmtDollar(score?.ppm_m1_price)}</span>
                      </td>
                      <td data-tour-id="method-2" style={{ padding: "1px 8px", textAlign: "center", opacity: m2na ? 0.35 : 1 }}>
                        {m2na
                          ? <span style={mut}>{m2NotApplicableReason}</span>
                          : <span style={{ display: "inline-block", background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.55)", width: "72px", padding: "2px 0", textAlign: "center", color: "#00ff41", fontSize: "10px", fontWeight: "bold" }}>{fmtDollar(score?.ppm_m2_price)}</span>
                        }
                      </td>
                      <td data-tour-id="method-3" style={{ padding: "1px 8px", textAlign: "center", opacity: m3na ? 0.35 : 1 }}>
                        {m3na
                          ? <span style={mut}>Div yield &lt; 4.5%</span>
                          : <>
                              <span style={{ display: "inline-block", background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.55)", width: "72px", padding: "2px 0", textAlign: "center", color: "#00ff41", fontSize: "10px", fontWeight: "bold" }}>{fmtDollar(score?.ppm_m3_price)}</span>
                            </>
                        }
                      </td>
                    </tr>
                    {hasDividend && arrowRow()}
                    {hasDividend && row({}, "DIV INCOME (5Y)",
                      <span style={{ display: "inline-block", border: "1px dashed rgba(0,255,65,0.4)", width: "72px", padding: "2px 0", textAlign: "center", color: "rgba(0,255,65,0.7)", fontSize: "10px" }}>
                        +{fmtDollar(effectiveCumDivPs)}
                      </span>,
                      m2na ? mv("—") : <span style={{ display: "inline-block", border: "1px dashed rgba(0,255,65,0.4)", width: "72px", padding: "2px 0", textAlign: "center", color: "rgba(0,255,65,0.7)", fontSize: "10px" }}>
                        +{fmtDollar(effectiveCumDivPs)}
                      </span>,
                      m3na ? mv("—") : <span style={{ color: "rgba(0,255,65,0.35)", fontSize: "9px" }}>incl. in price</span>
                    )}
                    {hasDividend && arrowRow()}
                    {hasDividend && (() => {
                      const tot1 = m1Total != null ? fmtDollar(m1Total) : "—"
                      const tot2 = m2Total != null && !m2na ? fmtDollar(m2Total) : null
                      return row({ background: "rgba(0,255,65,0.04)" }, "PRICE + DIV",
                        <span style={{ display: "inline-block", background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.7)", width: "72px", padding: "2px 0", textAlign: "center", color: "#00ff41", fontSize: "10px", fontWeight: "bold" }}>{tot1}</span>,
                        m2na ? mv("—") : <span style={{ display: "inline-block", background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.7)", width: "72px", padding: "2px 0", textAlign: "center", color: "#00ff41", fontSize: "10px", fontWeight: "bold" }}>{tot2 ?? "—"}</span>,
                        m3na ? mv("—") : <span style={{ color: "rgba(0,255,65,0.35)", fontSize: "9px" }}>{fmtDollar(m3Price)}</span>
                      )
                    })()}
                    {arrowRow(vsClr(m1Cagr), vsClr(m2Cagr), vsClr(m3Cagr))}
                    {row({}, "FUTURE RETURN (5Y)",
                      bvc(retX(m1Return), vsClr(m1Cagr)),
                      m2na ? mv("—") : bvc(retX(m2Return), vsClr(m2Cagr)),
                      m3na ? mv("—") : bvc(retX(m3Return), vsClr(m3Cagr))
                    )}
                    {arrowRow(vsClr(m1Cagr), vsClr(m2Cagr), vsClr(m3Cagr))}
                    {row({}, "RETURN CAGR (5Y)",
                      bvc(cagrP(m1Cagr), vsClr(m1Cagr)),
                      m2na ? mv("—") : bvc(cagrP(m2Cagr), vsClr(m2Cagr)),
                      m3na ? mv("—") : bvc(cagrP(m3Cagr), vsClr(m3Cagr))
                    )}
                    {arrowRow(vsClr(m1Cagr), vsClr(m2Cagr), vsClr(m3Cagr))}
                    {row({}, "VS S&P 500",
                      bvc(vsSP(m1Cagr), vsClr(m1Cagr)),
                      m2na ? mv("—") : bvc(vsSP(m2Cagr), vsClr(m2Cagr)),
                      m3na ? mv("—") : bvc(vsSP(m3Cagr), vsClr(m3Cagr))
                    )}
                  </tbody>
                </table>
              </div>
            )
          })()}
          </MethodologyToggle>

          {/* Blended projection */}
          <div data-tour-id="blended-projection" className="px-5 py-6 text-center" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
            <p className="text-[9px] font-bold tracking-[0.3em] mb-2" style={{ color: "rgba(0,255,65,0.3)" }}>
              {m1Mode ? "METHOD 1 ONLY" : "AVERAGE OF ALL METHODS"}
            </p>
            <p className="text-4xl font-bold font-mono" style={{ color: "#00ff41" }}>{fmtDollar(displayPrice)}</p>
            <p className="text-[9px] tracking-widest mt-1.5" style={{ color: "rgba(0,255,65,0.3)" }}>
              {m1Mode
                ? "M1 (EBITDA Multiple) standalone price target"
                : "Blending M1 + M2 (+ M3 if applicable) — averaged to one target price"}
            </p>
          </div>

          {/* Return summary */}
          <div className="flex items-center gap-4 px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
            <div className="flex-1 text-center">
              <p className="text-xs tracking-widest mb-1" style={{ color: "rgba(0,255,65,0.4)" }}>CURRENT PRICE</p>
              <p className="text-2xl font-bold font-mono" style={{ color: "#00ff41" }}>
                {fmtDollar(currentPrice)}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center shrink-0 gap-0.5">
              <p className="text-[9px] font-bold tracking-[0.2em]" style={{ color: "rgba(0,255,65,0.5)" }}>
                {displayCagr != null ? `CAGR (5Y) ${fmtCagr(displayCagr)}` : ""}
              </p>
              <p className="text-2xl font-mono" style={{ color: "rgba(0,255,65,0.3)" }}>→</p>
              <p className="text-[9px] font-bold tracking-[0.2em]" style={{ color: "rgba(0,255,65,0.5)" }}>
                {displayReturnMult != null ? `${displayReturnMult.toFixed(1)}x` : ""}
              </p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-xs tracking-widest mb-1" style={{ color: "rgba(0,255,65,0.4)" }}>
                {m1Mode ? "EBITDA-ONLY (5Y)" : "PROJECTED (5Y)"}
              </p>
              <p className="text-2xl font-bold font-mono" style={{ color: "#00ff41" }}>
                {fmtDollar(displayPrice)}
              </p>
            </div>
          </div>

          {/* S&P 500 benchmark comparison */}
          {(() => {
            const ppmCagrNum   = displayCagr
            const sp500CagrNum = score?.sp500_cagr != null ? Number(score.sp500_cagr) : null
            if (ppmCagrNum == null || sp500CagrNum == null) return null
            const ppmMult   = Math.pow(1 + ppmCagrNum,   5)
            const sp500Mult = Math.pow(1 + sp500CagrNum, 5)
            const diff = ppmCagrNum - sp500CagrNum
            const [compText, compColor] =
              diff > 0.01
                ? [`Beats S&P by +${(diff * 100).toFixed(1)}% per year`, "#00ff41"]
                : diff < -0.01
                  ? [`Trails S&P by ${(Math.abs(diff) * 100).toFixed(1)}% per year`, "#ef4444"]
                  : ["Roughly matches S&P 500", "#f59e0b"]
            const isClose     = Math.abs(diff) <= 0.01
            const tickerWins  = diff > 0.01
            const tickerColor = isClose ? "#f59e0b" : tickerWins ? "#00ff41" : "#ef4444"
            const sp500Color  = isClose ? "#f59e0b" : tickerWins ? "#ef4444" : "#00ff41"
            return (
              <div className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-center">
                    <p className="text-[10px] tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>{ticker} RETURN</p>
                    <p className="text-base font-bold font-mono" style={{ color: tickerColor }}>
                      {fmtCagr(ppmCagrNum)}
                    </p>
                    <p className="text-[10px] font-mono" style={{ color: "rgba(0,255,65,0.35)" }}>
                      {ppmMult.toFixed(1)}x in 5 years
                    </p>
                  </div>
                  <div className="shrink-0 px-2 text-center">
                    <p className="text-[10px] tracking-widest" style={{ color: "rgba(0,255,65,0.25)" }}>VS</p>
                  </div>
                  <div className="flex-1 text-center">
                    <p className="text-[10px] tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>S&P 500</p>
                    <p className="text-base font-mono" style={{ color: sp500Color }}>
                      {fmtCagr(sp500CagrNum)}
                    </p>
                    <p className="text-[10px] font-mono" style={{ color: "rgba(0,255,65,0.35)" }}>
                      {sp500Mult.toFixed(1)}x in 5 years
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-center font-mono mt-2" style={{ color: compColor }}>
                  {compText}
                </p>
              </div>
            )
          })()}

          {/* Projected Return score box */}
          {(() => {
            if (displayPpmScore == null || displayCagr == null || sp500Cagr == null) return null
            const ppmScore    = displayPpmScore
            const ppmCagr     = displayCagr
            const ppmCagrPct  = (ppmCagr * 100).toFixed(1)
            const sp500CagrPct = (sp500Cagr * 100).toFixed(1)
            const ratio       = sp500Cagr !== 0 ? (ppmCagr / sp500Cagr).toFixed(2) : "—"
            const needlePos = (() => {
              if (ppmCagr < sp500Cagr)
                return Math.max(0, (ppmCagr + sp500Cagr) / (2 * sp500Cagr) * 0.50)
              if (ppmCagr < 1.2 * sp500Cagr)
                return 0.50 + (ppmCagr - sp500Cagr) / (0.2 * sp500Cagr) * 0.10
              return Math.min(1.0, 0.60 + (ppmCagr - 1.2 * sp500Cagr) / (0.3 * sp500Cagr) * 0.40)
            })()
            return (
              <div className="mx-2 mt-4 mb-4 rounded p-3" style={{ border: "1px solid rgba(0,255,65,0.15)" }}>
                <p className="text-[10px] uppercase tracking-widest text-center mb-2" style={{ color: "rgba(0,255,65,0.4)" }}>
                  PROJECTED RETURN SCORE
                </p>
                <p className="text-3xl font-bold font-mono text-center" style={{ color: scoreColor(ppmScore) }}>
                  {ppmScore.toFixed(1)}%
                </p>
                <p className="text-[10px] italic text-center mt-2" style={{ color: "rgba(0,255,65,0.4)" }}>
                  {ticker} CAGR ÷ S&P CAGR
                </p>
                <p className="text-[11px] italic text-center" style={{ color: "rgba(0,255,65,0.8)" }}>
                  {ppmCagrPct}% ÷ {sp500CagrPct}% = {ratio}× → {ppmScore.toFixed(1)}%
                </p>
                {(() => {
                  const markerColor =
                    ppmCagr < sp500Cagr         ? "#ef4444"
                    : ppmCagr < 1.2 * sp500Cagr ? "#f59e0b"
                    : ppmCagr < 1.5 * sp500Cagr ? "#a3e635"
                    : "#00ff41"
                  const ticks = [
                    { left: "0%",   cagr: "−S&P", zone: "SELL", zoneColor: "rgba(239,68,68,0.6)"   },
                    { left: "30%",  cagr: "0",    zone: "",      zoneColor: "rgba(239,68,68,0.4)"   },
                    { left: "50%",  cagr: "S&P",  zone: "HOLD", zoneColor: "rgba(245,158,11,0.65)" },
                    { left: "60%",  cagr: "1.2×", zone: "BUY",  zoneColor: "rgba(163,230,53,0.65)" },
                    { left: "100%", cagr: "1.5×", zone: "BUY+", zoneColor: "rgba(0,255,65,0.7)"   },
                  ] as const
                  return (
                    <div className="mt-3">
                      <div className="relative h-8 mb-0.5">
                        <div
                          className="absolute flex flex-col items-center -translate-x-1/2"
                          style={{ left: `${needlePos * 100}%`, bottom: 0 }}
                        >
                          <span className="text-[9px] font-bold font-mono leading-none" style={{ color: markerColor, background: "rgba(0,0,0,0.8)", border: "1px solid currentColor", borderRadius: 4, padding: "2px 5px" }}>
                            {ratio}×
                          </span>
                          <span className="text-[9px] leading-none" style={{ color: markerColor }}>▼</span>
                        </div>
                      </div>
                      <div className="flex w-full h-2 rounded-full overflow-hidden">
                        <div style={{ width: "30%", background: "rgba(220,38,38,0.8)"   }} />
                        <div style={{ width: "20%", background: "rgba(180,40,40,0.4)"   }} />
                        <div style={{ width: "10%", background: "rgba(245,158,11,0.55)" }} />
                        <div style={{ width: "40%", background: "rgba(163,230,53,0.45)" }} />
                      </div>
                      <div className="relative" style={{ height: 48 }}>
                        {(["0%", "30%", "50%", "60%", "100%"] as const).map(left => (
                          <div key={left} className="absolute" style={{ left, top: 0, width: 1, height: 8, background: "rgba(255,255,255,0.4)", transform: "translateX(-50%)" }} />
                        ))}
                        {ticks.map(({ left, cagr }) => (
                          <span
                            key={cagr}
                            className="absolute"
                            style={{
                              left,
                              top: 10,
                              transform: left === "0%" ? "translateX(0%)" : left === "100%" ? "translateX(-100%)" : "translateX(-50%)",
                              background: "rgba(0,0,0,0.8)",
                              border: "1px solid rgba(255,255,255,0.2)",
                              borderRadius: 3,
                              padding: "2px 4px",
                              fontSize: 8,
                              fontFamily: "monospace",
                              color: "rgba(0,255,65,0.7)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {cagr}
                          </span>
                        ))}
                        {[
                          { left: "15%", zone: "SELL", color: "rgba(239,68,68,0.7)"  },
                          { left: "55%", zone: "HOLD", color: "rgba(245,158,11,0.7)" },
                          { left: "80%", zone: "BUY",  color: "rgba(163,230,53,0.7)" },
                          { left: "92%", zone: "BUY+", color: "rgba(0,255,65,0.7)"   },
                        ].map(({ left, zone, color }) => (
                          <span
                            key={zone}
                            className="absolute uppercase"
                            style={{ left, top: 32, transform: "translateX(-50%)", color, fontSize: 9, fontWeight: "bold" }}
                          >
                            {zone}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}
          </div>
        </CollapsibleLayer>

          {/* Layer 2: Growth */}
          <CollapsibleLayer id={3} header={(
            <>
              <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>
                LAYER 2 — GROWTH QUALITY
              </p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(0,255,65,0.4)" }}>
                Historical financials and growth trajectory
              </p>
            </>
          )} shareButton={<BlockShareButton captureIds={['capture-3']} mode="single" fileName={`${ticker}-layer2`} blockTitle="LAYER 2 — GROWTH QUALITY" {...shareProps} />}>
          <div id="capture-3">
          {(() => {
            type FundRow = { fiscal_year: number; revenue: number | null; ebitda: number | null; free_cash_flow: number | null }
            type MetricKey = "revenue" | "ebitda" | "free_cash_flow"
            const rows = fundamentals as FundRow[]
            if (!rows.length) return null
            const CHART_H = 80

            const SIG_COLOR: Record<string, string> = {
              "Solid Growth": "#00ff41", "Slowing Growth": "#00ff41",
              "Decelerating": "#f59e0b", "Deteriorating": "#f59e0b", "Freefall": "#ef4444",
            }
            const sp500CagrL2 = score?.sp500_cagr != null ? Number(score.sp500_cagr) : null
            const FCF_TREND: Record<string, { arrow: string; label: string }> = {
              "Solid Growth":   { arrow: "↑", label: "Growing" },
              "Slowing Growth": { arrow: "↑", label: "Growing" },
              "Decelerating":   { arrow: "→", label: "Slowing" },
              "Deteriorating":  { arrow: "↓", label: "Declining" },
              "Freefall":       { arrow: "↓", label: "Declining" },
            }

            const metrics: { key: MetricKey; label: string; cagr: number | null | undefined; signal: string | null | undefined }[] = [
              { key: "revenue",        label: "REVENUE",        cagr: score?.revenue_cagr_5y,  signal: score?.gq_signal_revenue },
              { key: "ebitda",         label: "EBITDA",         cagr: score?.net_income_cagr_5y != null ? Number(score.net_income_cagr_5y) : null, signal: score?.gq_signal_net_income },
              { key: "free_cash_flow", label: "FREE CASH FLOW", cagr: score?.fcf_cagr_5y,      signal: score?.gq_signal_fcf },
            ]

            return (
              <>
              <div className="px-5 pb-5" style={{ borderTop: "1px solid rgba(0,255,65,0.1)" }}>
                <div className="pt-4 pb-2 mb-3" style={{ borderBottom: "1px solid rgba(0,255,65,0.3)" }}>
                  <p className="text-base font-bold leading-tight" style={{ color: "#00ff41" }}>HISTORICAL GROWTH TREND</p>
                  <p className="text-xs tracking-widest mt-0.5" style={{ color: "rgba(0,255,65,0.4)" }}>REVENUE · EBITDA · FREE CASH FLOW</p>
                </div>
                <div data-tour-id="growth-metrics" className="space-y-6">
                  {metrics.map(({ key, label, cagr, signal }) => {
                    const vals = rows.map(r => {
                      const v = r[key]
                      return { year: r.fiscal_year, v, isNeg: v != null && v < 0 }
                    })
                    const nonNull = vals.filter(x => x.v != null).map(x => x.v as number)
                    if (!nonNull.length) return null
                    const baseV0  = vals[0]?.v
                    const sp500Y5 = sp500CagrL2 != null && baseV0 != null && baseV0 > 0
                      ? baseV0 * Math.pow(1 + sp500CagrL2, nonNull.length - 1)
                      : 0
                    const greenY5 = cagr != null && baseV0 != null && baseV0 > 0
                      ? baseV0 * Math.pow(1 + Number(cagr), nonNull.length - 1)
                      : 0
                    const maxPos     = Math.max(0, ...nonNull, sp500Y5, greenY5)
                    const maxNeg     = Math.min(0, ...nonNull)
                    const totalRange = maxPos - maxNeg || 1
                    const negH       = Math.abs(maxNeg) / totalRange * CHART_H
                    const zeroY      = maxPos            / totalRange * CHART_H
                    const cagrNum    = cagr != null ? Number(cagr) : null
                    const benchLabel = cagrNum == null || sp500CagrL2 == null ? null
                      : cagrNum < 0              ? "Declining vs S&P 500"
                      : cagrNum >= sp500CagrL2 * 1.5 ? "Exceptional vs S&P 500"
                      : cagrNum >= sp500CagrL2 * 1.2 ? "Strong vs S&P 500"
                      : cagrNum >= sp500CagrL2       ? "Solid vs S&P 500"
                      : "Moderate vs S&P 500"
                    const benchColor = benchLabel?.startsWith("Exceptional") || benchLabel?.startsWith("Strong") || benchLabel?.startsWith("Solid")
                      ? "#00ff41"
                      : benchLabel?.startsWith("Moderate") ? "#f59e0b"
                      : "#ef4444"
                    return (
                      <div key={key} data-tour-id={`growth-${key.replaceAll('_', '-')}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold tracking-widest shrink-0" style={{ color: "rgba(0,255,65,0.7)" }}>
                            {label}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {benchLabel && (
                              <span className="text-[10px] font-mono font-bold tracking-wider" style={{ color: benchColor }}>
                                {benchLabel.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                        {cagrNum != null && (
                          <div className="flex items-center gap-1.5 mb-2" style={{ marginTop: 2 }}>
                            <span
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                              style={{
                                background: "rgba(0,255,65,0.15)",
                                border: "1px solid #00ff41",
                                color: "#00ff41",
                              }}
                            >
                              Avg. Growth {cagrNum >= 0 ? "+" : ""}{(cagrNum * 100).toFixed(1)}%
                            </span>
                            {sp500CagrL2 != null && (
                              <span
                                data-tour-id="growth-sp500"
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                                style={{
                                  background: "rgba(255,0,0,0.15)",
                                  border: "1px solid #ff0000",
                                  color: "#ff0000",
                                }}
                              >
                                S&P {sp500CagrL2 >= 0 ? "+" : ""}{(sp500CagrL2 * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        )}
                        {(() => {
                          const nBars  = vals.length
                          const toSvgY = (v: number) =>
                            Math.max(0, Math.min(CHART_H, zeroY - v / totalRange * CHART_H))
                          const baseV = vals[0]?.v
                          type GreenPt = { x: number; y: number }
                          let greenPoints: GreenPt[] | null = null
                          if (cagrNum != null && baseV != null && baseV > 0) {
                            greenPoints = vals.map((_, i) => ({
                              x: (i + 0.5) / nBars * 100,
                              y: toSvgY(baseV * Math.pow(1 + cagrNum, i)),
                            }))
                          }
                          type SpPt = { x: number; y: number }
                          let spPoints: SpPt[] | null = null
                          if (sp500CagrL2 != null && baseV != null && baseV > 0) {
                            spPoints = vals.map((_, i) => ({
                              x: (i + 0.5) / nBars * 100,
                              y: toSvgY(baseV * Math.pow(1 + sp500CagrL2, i)),
                            }))
                          }
                          return (
                            <div className="relative" style={{ height: CHART_H }}>
                              {maxNeg < 0 && (
                                <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: zeroY, height: 1, background: "rgba(0,255,65,0.2)" }} />
                              )}
                              <div className="absolute inset-0 flex gap-1.5">
                                {vals.map(({ year, v, isNeg }) => {
                                  const barH = v != null ? Math.max(2, Math.round(Math.abs(v) / totalRange * CHART_H)) : 0
                                  return (
                                    <div key={year} className="group flex-1 relative" style={{ minWidth: 0 }}>
                                      {v != null && (
                                        <div
                                          className={`absolute inset-x-0 ${isNeg ? "rounded-b-sm" : "rounded-t-sm"} opacity-40 group-hover:opacity-100 transition-opacity duration-100`}
                                          style={{
                                            height: barH,
                                            [isNeg ? "top" : "bottom"]: `${isNeg ? zeroY : negH}px`,
                                            background: isNeg ? "#ef4444" : "#00ff41",
                                          }}
                                        />
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                              {(greenPoints || spPoints) && (
                                <svg
                                  className="absolute inset-0 pointer-events-none"
                                  width="100%" height={CHART_H}
                                  viewBox={`0 0 100 ${CHART_H}`}
                                  preserveAspectRatio="none"
                                >
                                  {greenPoints && signal && (
                                    <polyline
                                      points={greenPoints.map(p => `${p.x},${p.y}`).join(" ")}
                                      fill="none"
                                      stroke={SIG_COLOR[signal] ?? "#00ff41"}
                                      strokeWidth="1"
                                      strokeOpacity="0.5"
                                      vectorEffect="non-scaling-stroke"
                                    />
                                  )}
                                  {spPoints && (
                                    <polyline
                                      points={spPoints.map(p => `${p.x},${p.y}`).join(" ")}
                                      fill="none"
                                      stroke="#ff0000"
                                      strokeWidth="1"
                                      strokeOpacity="0.6"
                                      vectorEffect="non-scaling-stroke"
                                    />
                                  )}
                                </svg>
                              )}
                            </div>
                          )
                        })()}
                        <div className="flex gap-1.5 mt-1.5" data-tour-id={key === 'revenue' ? 'growth-yoy' : undefined}>
                          {vals.map(({ year, v, isNeg }, i) => {
                            const prevV      = i > 0 ? vals[i - 1].v : null
                            const absChange  = v != null && prevV != null ? v - prevV : null
                            const pctChange  = absChange != null && prevV != null && prevV !== 0
                              ? (absChange / Math.abs(prevV)) * 100
                              : null
                            const changeColor = absChange == null
                              ? "rgba(0,255,65,0.3)"
                              : absChange > 0 ? "#00ff41"
                              : absChange < 0 ? "#ef4444"
                              : "rgba(0,255,65,0.3)"
                            return (
                              <div key={year} className="flex-1 text-center" style={{ minWidth: 0 }}>
                                <span className="block text-[11px] font-mono font-bold leading-tight" style={{ color: isNeg ? "#ef4444" : "#00ff41" }}>
                                  {v != null ? fmtBn(Math.abs(v)) : "—"}
                                </span>
                                {i === 0 ? (
                                  <>
                                    <div className="flex justify-between text-[10px] font-mono leading-tight"><span style={{ color: "#00ff41" }}>Growth</span><span style={{ color: "#00ff41" }}>→</span></div>
                                    <div className="flex justify-between text-[10px] font-mono leading-tight"><span style={{ color: "#00ff41" }}>YoY %</span><span style={{ color: "#00ff41" }}>→</span></div>
                                  </>
                                ) : (
                                  <>
                                    {absChange != null && (
                                      <span className="block text-[10px] font-mono leading-tight" style={{ color: changeColor }}>
                                        {(() => {
                                          const sign = absChange >= 0 ? "+" : "-"
                                          const abs  = Math.abs(absChange)
                                          const bn   = abs / 1_000_000_000
                                          const mn   = abs / 1_000_000
                                          if (bn >= 1) return `${sign}$${bn.toFixed(1)}B`
                                          if (mn >= 1) return `${sign}$${mn.toFixed(1)}M`
                                          return `${sign}$${abs.toFixed(0)}`
                                        })()}
                                      </span>
                                    )}
                                    {pctChange != null && (
                                      <span className="block text-[10px] font-mono leading-tight" style={{ color: changeColor }}>
                                        {(pctChange >= 0 ? "+" : "") + pctChange.toFixed(1) + "%"}
                                      </span>
                                    )}
                                  </>
                                )}
                                <span className="block text-[10px] font-mono leading-tight" style={{ color: "rgba(255,255,255,0.5)" }}>
                                  {year}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              {/* Growth Quality score section */}
              {(() => {
                if (score?.growth_score == null) return null
                const gScore    = Number(score.growth_score)
                const sp500Base = score?.sp500_cagr != null ? Math.max(Number(score.sp500_cagr), 0.01) : 0.10
                const cagrToScoreL2 = (cagr: number | null | undefined): number => {
                  if (cagr == null) return 50
                  const cap = sp500Base * 2, mid = sp500Base, floor = -sp500Base
                  if (cagr >= cap) return 100
                  if (cagr >= mid) return 50 + (cagr - mid) / (cap - mid) * 50
                  if (cagr >= 0)   return 35 + (cagr / mid) * 15
                  if (cagr >= floor) return Math.max(0, (cagr - floor) / (-floor) * 35)
                  return 0
                }
                const revCagr = score?.revenue_cagr_5y    != null ? Number(score.revenue_cagr_5y)    : null
                const niCagr  = score?.net_income_cagr_5y != null ? Number(score.net_income_cagr_5y) : null
                const fcfCagr = score?.fcf_cagr_5y        != null ? Number(score.fcf_cagr_5y)        : null
                const revSig  = score?.gq_signal_revenue    ?? null
                const niSig   = score?.gq_signal_net_income ?? null
                const fcfSig  = score?.gq_signal_fcf        ?? null
                const revPts  = Math.round(cagrToScoreL2(revCagr))
                const niPts   = Math.round(cagrToScoreL2(niCagr))
                const fcfPts  = fcfCagr != null ? Math.round(cagrToScoreL2(fcfCagr)) : null
                const TREND_MULT: Record<string, number> = {
                  "Solid Growth": 1.00, "Slowing Growth": 0.90,
                  "Decelerating": 0.75, "Deteriorating": 0.50, "Freefall": 0.25,
                }
                const allSigs    = [revSig, niSig, fcfSig].filter(Boolean) as string[]
                const worstMult  = allSigs.length ? Math.min(...allSigs.map(s => TREND_MULT[s] ?? 1.0)) : 1.0
                const worstSig   = allSigs.find(s => (TREND_MULT[s] ?? 1.0) === worstMult) ?? null
                const hasPenalty = worstMult <= 0.75
                const toNeedlePos = (s: number): number => {
                  if (s <= 0)  return 0
                  if (s <= 40) return s / 40 * 0.50
                  if (s <= 48) return 0.50 + (s - 40) / 8 * 0.10
                  return Math.min(1.0, 0.60 + (s - 48) / 52 * 0.40)
                }
                const toMarkerColor = (s: number) =>
                  s < 40 ? "#ef4444" : s < 48 ? "#f59e0b" : s < 60 ? "#a3e635" : "#00ff41"
                const SCORE_TICKS = [
                  { left: "0%",   label: "-S&P", zone: "SELL", zoneColor: "rgba(239,68,68,0.6)"   },
                  { left: "30%",  label: "0",    zone: "",      zoneColor: "rgba(239,68,68,0.4)"   },
                  { left: "50%",  label: "S&P",  zone: "HOLD", zoneColor: "rgba(245,158,11,0.65)" },
                  { left: "60%",  label: "1.2×", zone: "BUY",  zoneColor: "rgba(163,230,53,0.65)" },
                  { left: "100%", label: "1.5×", zone: "BUY+", zoneColor: "rgba(0,255,65,0.7)"    },
                ] as const
                const miniRows = [
                  { name: "REVENUE", sig: revSig, pts: revPts, cagr: revCagr },
                  { name: "EBITDA",  sig: niSig,  pts: niPts,  cagr: niCagr  },
                  { name: "FCF",     sig: fcfSig, pts: fcfPts, cagr: fcfCagr },
                ]
                const validPts     = miniRows.map(r => r.pts).filter((p): p is number => p != null)
                const rawScore     = validPts.length ? Math.round(validPts.reduce((s, p) => s + p, 0) / validPts.length) : null
                const penaltyLabel = hasPenalty && worstSig ? `${worstSig} ×${worstMult.toFixed(2)}` : "None"
                return (
                  <div data-tour-id="growth-score" className="mx-2 mt-4 mb-4 rounded p-3" style={{ border: "1px solid rgba(0,255,65,0.15)" }}>
                    <div className="mb-3 pb-2" style={{ borderBottom: "1px solid rgba(0,255,65,0.08)" }}>
                      <p className="text-[10px] uppercase tracking-widest text-center" style={{ color: "rgba(0,255,65,0.4)" }}>
                        GROWTH QUALITY SCORE
                      </p>
                      <p className="text-3xl font-bold font-mono text-center mt-1" style={{ color: scoreColor(gScore) }}>
                        {gScore.toFixed(1)}%
                      </p>
                    </div>
                    <p className="text-[10px] font-mono text-center mb-2" style={{ color: "rgba(0,255,65,0.8)" }}>
                      Scored on Avg. Growth Rate vs S&P 500
                    </p>
                    <div className="space-y-0">
                      {miniRows.map(({ name, sig, pts, cagr }, rowIdx) => {
                        const ptsNum = pts ?? 0
                        const needle = toNeedlePos(ptsNum)
                        const mc     = pts != null ? toMarkerColor(ptsNum) : "rgba(0,255,65,0.3)"
                        const formulaLabel = cagr != null && sp500Base > 0
                          ? `${ticker} ${(cagr * 100).toFixed(1)}% ÷ S&P ${(sp500Base * 100).toFixed(1)}% = ${(cagr / sp500Base).toFixed(2)}×`
                          : sig && FCF_TREND[sig] ? `${FCF_TREND[sig].arrow} ${FCF_TREND[sig].label}` : "—"
                        return (
                          <div key={name}>
                            <div className="relative mb-0.5" style={{ height: 20, marginLeft: 68 }}>
                              <div
                                className="absolute flex flex-col items-center -translate-x-1/2"
                                style={{ left: `${needle * 100}%`, bottom: 0 }}
                              >
                                <span className="text-[9px] font-bold font-mono leading-none" style={{ color: mc, background: "rgba(0,0,0,0.8)", border: "1px solid currentColor", borderRadius: 4, padding: "2px 5px" }}>
                                  {cagr != null && sp500Base > 0 ? `${(cagr / sp500Base).toFixed(2)}× → ${pts != null ? `${pts}%` : "N/A"}` : "—"}
                                </span>
                                <span className="text-[9px] leading-none" style={{ color: mc }}>▼</span>
                              </div>
                            </div>
                            <div className={rowIdx === miniRows.length - 1 ? "flex items-start gap-2" : "flex items-center gap-2"}>
                              <p className="text-[10px] font-mono font-bold shrink-0" title={formulaLabel} style={{ width: 60, color: "#00ff41", cursor: "help" }}>{name}</p>
                              <div className="flex-1 min-w-0">
                                <div className="flex w-full h-2 rounded-full overflow-hidden">
                                  <div style={{ width: "30%", background: "rgba(220,38,38,0.8)"   }} />
                                  <div style={{ width: "20%", background: "rgba(180,40,40,0.4)"   }} />
                                  <div style={{ width: "10%", background: "rgba(245,158,11,0.55)" }} />
                                  <div style={{ width: "40%", background: "rgba(163,230,53,0.45)" }} />
                                </div>
                                <div className="relative" style={{ height: rowIdx === miniRows.length - 1 ? 48 : 8 }}>
                                  {(["0%", "30%", "50%", "60%", "100%"] as const).map(left => (
                                    <div key={left} className="absolute" style={{ left, top: 0, width: 1, height: 8, background: "rgba(255,255,255,0.4)", transform: "translateX(-50%)" }} />
                                  ))}
                                  {rowIdx === miniRows.length - 1 && SCORE_TICKS.map(({ left, label }) => (
                                    <span
                                      key={label}
                                      className="absolute"
                                      style={{
                                        left,
                                        top: 10,
                                        transform: left === "0%" ? "translateX(0%)" : left === "100%" ? "translateX(-100%)" : left === "50%" ? "translateX(-80%)" : left === "60%" ? "translateX(-20%)" : "translateX(-50%)",
                                        background: "rgba(0,0,0,0.8)",
                                        border: "1px solid rgba(255,255,255,0.2)",
                                        borderRadius: 3,
                                        padding: "2px 4px",
                                        fontSize: 8,
                                        fontFamily: "monospace",
                                        color: "rgba(0,255,65,0.7)",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {rawScore != null && (
                      <div className="mt-3 font-mono">
                        <p style={{ fontSize: 9, color: "rgba(0,255,65,0.8)" }}>Score Breakdown:</p>
                        <p style={{ fontSize: 10, color: "#00ff41" }}>
                          ({revPts}% + {niPts}% + {fcfPts != null ? `${fcfPts}%` : "N/A"}) ÷ 3 × {worstMult.toFixed(2)} = {gScore.toFixed(1)}%
                        </p>
                        <div className="mt-2 space-y-0.5 text-[9px]">
                          <div className="flex">
                            <span className="w-28" style={{ color: "rgba(0,255,65,0.7)" }}>Average score</span>
                            <span style={{ color: "#00ff41" }}>: {rawScore}%</span>
                          </div>
                          <div className="flex">
                            <span className="w-28" style={{ color: worstMult !== 1.0 ? "rgba(245,158,11,0.9)" : "rgba(0,255,65,0.7)" }}>Trend penalty</span>
                            <span style={{ color: worstMult !== 1.0 ? "rgba(245,158,11,0.9)" : "rgba(0,255,65,0.7)" }}>: {penaltyLabel}</span>
                          </div>
                          <div className="flex">
                            <span className="w-28" style={{ color: "rgba(0,255,65,0.7)" }}>Final score</span>
                            <span style={{ color: scoreColor(gScore) }}>: {gScore.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
              </>
            )
          })()}
          </div>
        </CollapsibleLayer>

          {/* Layer 3: Health */}
          <CollapsibleLayer id={4} header={(
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>
              LAYER 3 — FINANCIAL HEALTH
            </p>
          )} shareButton={<BlockShareButton captureIds={['capture-4']} mode="single" fileName={`${ticker}-layer3`} blockTitle="LAYER 3 — FINANCIAL HEALTH" {...shareProps} />}>
          <div className="px-5 pt-4 pb-3" id="capture-4" data-tour-id="health-summary">
            <div className="flex items-center rounded-lg p-4 mb-3" style={{ border: "1px solid rgba(0,255,65,0.2)" }}>
              <div className="flex-1 flex flex-col items-center">
                <p className="text-4xl font-bold font-mono" style={{ color: healthColor(score?.health_score) }}>
                  {score?.health_passes ?? 0}/{scoredTotal}
                </p>
                <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: healthColor(score?.health_score), opacity: 0.6 }}>
                  CHECKS PASSED
                </p>
              </div>
              <div className="self-stretch mx-4" style={{ width: 1, background: "rgba(0,255,65,0.2)" }} />
              <div className="flex-1 flex flex-col items-center">
                <p className="text-4xl font-bold font-mono" style={{ color: healthColor(score?.health_score) }}>
                  {score?.health_score != null ? `${Number(score.health_score).toFixed(1)}%` : "—"}
                </p>
                <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: healthColor(score?.health_score), opacity: 0.6 }}>
                  HEALTH SCORE
                </p>
              </div>
            </div>
            <div className="h-1 rounded-full w-full" style={{ background: "rgba(0,255,65,0.1)" }}>
              <div className="h-full rounded-full" style={{ width: `${score?.health_score ?? 0}%`, background: healthColor(score?.health_score), opacity: 0.8 }} />
            </div>
          </div>
          <HealthCategories cats={healthCats} fundamentals={fundamentals as HealthFundRow[]} />
        </CollapsibleLayer>

          {/* Layer 4: Final */}
          <CollapsibleLayer id={5} header={(
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>
              LAYER 4 — FINAL SCORE
            </p>
          )} shareButton={<BlockShareButton captureIds={['capture-5']} mode="single" fileName={`${ticker}-layer4`} blockTitle="LAYER 4 — FINAL SCORE" {...shareProps} />}>
          <div className="px-5 py-6 space-y-3" id="capture-5" data-tour-id="final-score">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "PROJECTED RETURN", sub: "(5Y)", weight: "WEIGHT: 40%", value: displayPpmScore },
                { label: "GROWTH QUALITY",   sub: null,   weight: "WEIGHT: 30%", value: score?.growth_score },
                { label: "FINANCIAL HEALTH", sub: null,   weight: "WEIGHT: 30%", value: score?.health_score },
              ].map(({ label, sub, weight, value }, idx) => {
                const c = healthColor(value != null ? Number(value) : null)
                return (
                  <div key={idx} className="flex flex-col items-center gap-1.5">
                    <div className="w-full rounded px-3 py-2 text-center flex flex-col items-center justify-center min-h-[72px]" style={{ border: "1px solid rgba(0,255,65,0.3)" }}>
                      <p className="text-[10px] tracking-widest leading-tight" style={{ color: "rgba(0,255,65,0.6)" }}>{label}</p>
                      {sub && <p className="text-[10px] leading-tight" style={{ color: "rgba(0,255,65,0.4)" }}>{sub}</p>}
                    </div>
                    <p className="text-[9px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}>{weight}</p>
                    <p className="text-2xl font-bold font-mono" style={{ color: c }}>
                      {value != null ? `${Number(value).toFixed(1)}%` : "—"}
                    </p>
                    <p className="text-[9px] italic text-center mt-1" style={{ color: "rgba(0,255,65,0.4)" }}>
                      {idx === 0
                        ? `${displayCagr != null ? `${(displayCagr * 100).toFixed(1)}% CAGR (5Y)` : "—"} vs S&P ${sp500Cagr != null ? `${(sp500Cagr * 100).toFixed(1)}%` : "—"} benchmark`
                        : idx === 1
                        ? "Revenue, EBITDA & FCF growth, adjusted for trend quality"
                        : `${score?.health_passes ?? 0} of ${scoredTotal} Buffett checks passed`}
                    </p>
                  </div>
                )
              })}
            </div>
            <div className="relative" style={{ height: 28 }}>
              <div className="absolute inset-x-0" style={{ top: 10, height: 1, background: "rgba(0,255,65,0.15)" }} />
              <div className="absolute inset-x-0 text-center" style={{ top: 10 }}>
                <span className="text-sm" style={{ color: "rgba(0,255,65,0.3)" }}>↓</span>
              </div>
            </div>
            <div className="text-center space-y-3 pb-2">
              <p className="text-[10px] tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>FINAL SCORE</p>
              <p className="text-4xl font-bold font-mono" style={{ color: scoreColor(displayFinalScore) }}>
                {displayFinalScore != null ? `${Number(displayFinalScore).toFixed(1)}%` : "—"}
              </p>
              {(() => {
                const s = (displaySignal ?? "").toUpperCase()
                const styles: Record<string, React.CSSProperties> = {
                  "BUY+": { background: "rgba(0,255,65,0.25)",  color: "#00ff41", border: "1px solid rgba(0,255,65,0.9)" },
                  BUY:    { background: "rgba(0,255,65,0.15)",  color: "#00ff41", border: "1px solid rgba(0,255,65,0.6)" },
                  HOLD:   { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.5)" },
                  SELL:   { background: "rgba(239,68,68,0.15)",  color: "#ef4444", border: "1px solid rgba(239,68,68,0.5)" },
                }
                return (
                  <div className="flex justify-center">
                    <span
                      className="inline-block text-lg font-bold tracking-widest px-6 py-2 rounded"
                      style={styles[s] ?? { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      {s || "—"}
                    </span>
                  </div>
                )
              })()}
            </div>
          </div>
        </CollapsibleLayer>

        </LayerProvider>
      </div>
    </div>
  )
}
