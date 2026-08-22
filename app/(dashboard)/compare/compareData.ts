import { supabaseAdmin } from "@/lib/supabase"
import { fmtDollar, fmtCagr, fmtPe, fmtYld } from "@/lib/format"
import { tallyWins } from "./compareTypes"
import type { Mode, CompareMetricRow, CompareSection, CompareResult } from "./compareTypes"

export type { Mode, Direction, CompareMetricRow, CompareSection, CompareResult } from "./compareTypes"

// health_details is a flat jsonb array of {name, pass, ...} -- Compare lists
// every check as its own row (no category grouping, per the flat
// metric-table format), so unlike screener/[ticker]/page.tsx it doesn't need
// the 4-category positional slice, just the raw name+pass per entry.
type HealthCheck = { name: string; pass: boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Score = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Stock = Record<string, any>

async function fetchTicker(ticker: string) {
  const [stockRes, priceRes, scoreRes] = await Promise.all([
    supabaseAdmin.from("stocks").select("*").eq("ticker", ticker).single(),
    supabaseAdmin.from("stock_prices").select("*").eq("ticker", ticker).single(),
    supabaseAdmin.from("stock_scores").select("*").eq("ticker", ticker).single(),
  ])
  if (stockRes.error && scoreRes.error) return null
  return {
    stock: stockRes.data as Stock | null,
    price: priceRes.data as Record<string, number> | null,
    score: scoreRes.data as Score | null,
  }
}

function num(v: unknown): number | null {
  return v != null ? Number(v) : null
}

// Blended price target + 5Y cumulative dividends -> total return multiplier
// and CAGR. Verbatim from TickerPageContent.tsx:176-190.
function projectedReturn(score: Score | null, currentPrice: number | null) {
  const blendedPrice = num(score?.ppm_blended_price)
  const cumDivPs = (() => {
    const db = num(score?.m_cumulative_div_ps) ?? 0
    if (db > 0) return db
    const yld = num(score?.div_yield_5y_avg) ?? num(score?.div_yield) ?? 0
    return yld > 0 && currentPrice ? currentPrice * yld * 5 : 0
  })()
  const totalReturnPrice = blendedPrice != null ? blendedPrice + cumDivPs : null
  const totalReturnMult =
    totalReturnPrice != null && currentPrice != null && currentPrice > 0
      ? totalReturnPrice / currentPrice
      : null
  const totalReturnCagr = totalReturnMult != null ? Math.pow(totalReturnMult, 0.2) - 1 : null
  const hasDividend = cumDivPs > 0.01
  return { cumDivPs, totalReturnMult, totalReturnCagr, hasDividend }
}

// Market Comparison's sector-override switch. Verbatim from
// TickerPageContent.tsx:498-524 -- also the source of the hardcoded S&P 500
// benchmark constants, which aren't stored anywhere in the DB.
function marketComparisonFields(score: Score | null) {
  const isFinancialMultiple = score?.sector_override === "Bank" || score?.sector_override === "Financial"
  return {
    isFinancialMultiple,
    primaryLabel: isFinancialMultiple ? "P/E" : "EV/EBITDA",
    primaryCurrent: isFinancialMultiple ? num(score?.pe_ratio) : num(score?.ev_ebitda_current),
    primary5yAvg: isFinancialMultiple ? num(score?.pe_5y_avg) : num(score?.ev_ebitda_5y_avg),
    industryPrimary: isFinancialMultiple ? num(score?.industry_pe) : num(score?.industry_ev_ebitda),
    industryPrimary5y: isFinancialMultiple ? num(score?.industry_pe_5y_avg) : num(score?.industry_ev_ebitda_5y_avg),
    sp500PrimaryNow: isFinancialMultiple ? 22 : 14.5,
    sp500Primary5y: isFinancialMultiple ? 19 : 13.5,
    fcfYield: num(score?.fcf_yield),
    fcf5yAvg: num(score?.fcf_5y_avg),
    industryFcf: num(score?.industry_fcf_yield),
    industryFcf5y: num(score?.industry_fcf_5y_avg),
    divYield: num(score?.div_yield),
    div5yAvg: num(score?.div_yield_5y_avg),
    industryDiv: num(score?.industry_div_yield),
    industryDiv5y: num(score?.industry_div_yield_5y_avg),
  }
}
const SP500_FCF_NOW = 0.035
const SP500_FCF_5Y = 0.032
const SP500_DIV_NOW = 0.013
const SP500_DIV_5Y = 0.018

function healthChecks(score: Score | null): HealthCheck[] {
  const raw: HealthCheck[] = Array.isArray(score?.health_details) ? score.health_details : []
  return raw
}

function overviewSection(stockA: Stock | null, priceA: Record<string, number> | null, scoreA: Score | null, stockB: Stock | null, priceB: Record<string, number> | null, scoreB: Score | null): CompareSection {
  return {
    title: "OVERVIEW",
    rows: [
      { label: "NAME", valueA: stockA?.name ?? null, valueB: stockB?.name ?? null, direction: "none" },
      { label: "SECTOR", valueA: stockA?.sector ?? null, valueB: stockB?.sector ?? null, direction: "none" },
      { label: "INDUSTRY", valueA: stockA?.industry ?? null, valueB: stockB?.industry ?? null, direction: "none" },
      { label: "EXCHANGE", valueA: stockA?.exchange ?? null, valueB: stockB?.exchange ?? null, direction: "none" },
      { label: "CURRENT PRICE", valueA: num(priceA?.current_price), valueB: num(priceB?.current_price), direction: "none", format: fmtDollarSafe },
      { label: "SIGNAL", valueA: scoreA?.signal ?? null, valueB: scoreB?.signal ?? null, direction: "none" },
      { label: "FINAL SCORE", valueA: num(scoreA?.final_score), valueB: num(scoreB?.final_score), direction: "higher", band: 0, format: fmtNumSafe },
    ],
  }
}

const PPM_SCORE_INFO = "Blends the projected 5-year return across the EBITDA, FCF, and Dividend price-target methods into one 0-100 score, scaled against the S&P 500's own return. Higher means a stronger expected return relative to the market, not just a bigger price target."

// Trimmed to the rows that carry real signal for a side-by-side: the
// per-method price targets (M1/M2/M3) and DIV INCOME were dropped as
// clutter -- BLENDED PRICE TARGET already folds them together, and
// PROJECTED RETURN/CAGR already include dividend income in the total.
function priceProjectionSection(scoreA: Score | null, priceA: number | null, scoreB: Score | null, priceB: number | null): CompareSection {
  const retA = projectedReturn(scoreA, priceA)
  const retB = projectedReturn(scoreB, priceB)

  return {
    title: "LAYER 1 — PRICE PROJECTION",
    rows: [
      { label: "BLENDED PRICE TARGET", valueA: num(scoreA?.ppm_blended_price), valueB: num(scoreB?.ppm_blended_price), direction: "none", format: fmtDollarSafe },
      { label: "PROJECTED RETURN (5Y)", valueA: retA.totalReturnMult, valueB: retB.totalReturnMult, direction: "higher", band: 0, format: fmtMultSafe },
      { label: "PROJECTED CAGR (5Y)", valueA: retA.totalReturnCagr, valueB: retB.totalReturnCagr, direction: "higher", band: 0, format: fmtCagrSafe },
      { label: "VS S&P 500 CAGR", valueA: num(scoreA?.sp500_cagr), valueB: num(scoreB?.sp500_cagr), direction: "none", format: fmtCagrSafe },
      { label: "PPM SCORE", valueA: num(scoreA?.ppm_score), valueB: num(scoreB?.ppm_score), direction: "higher", band: 0, format: fmtNumSafe, info: PPM_SCORE_INFO },
    ],
  }
}

// STOCK vs S&P 500 mode's Price Projection: the only real head-to-head data
// here is the ticker's own projected return/CAGR against the S&P 500 columns
// stored right on its own stock_scores row (score.sp500_5y_return/sp500_cagr)
// -- the same two numbers TickerPageContent.tsx's "WHAT YOU ARE BUYING"
// scorecard already compares (its "5Y RETURN VS S&P 500" / "CAGR (5Y) VS
// S&P 500" rows, TickerPageContent.tsx:384-403). There's no synthetic
// "S&P 500 price target" to compare the other Price Projection rows
// (blended price target, M1/M2/M3, PPM score) against, so this section is
// deliberately just these two rows rather than a full copy of
// priceProjectionSection with a null Stock B.
function priceProjectionVsSp500Section(scoreA: Score | null, currentPriceA: number | null): CompareSection {
  const retA = projectedReturn(scoreA, currentPriceA)
  return {
    title: "LAYER 1 — PRICE PROJECTION",
    rows: [
      { label: "PROJECTED RETURN (5Y)", valueA: retA.totalReturnMult, valueB: num(scoreA?.sp500_5y_return), direction: "higher", band: 0, format: fmtMultSafe },
      { label: "PROJECTED CAGR (5Y)", valueA: retA.totalReturnCagr, valueB: num(scoreA?.sp500_cagr), direction: "higher", band: 0, format: fmtCagrSafe },
    ],
  }
}

function growthQualitySection(scoreA: Score | null, scoreB: Score | null): CompareSection {
  return {
    title: "LAYER 2 — GROWTH QUALITY",
    rows: [
      { label: "REVENUE CAGR (5Y)", valueA: num(scoreA?.revenue_cagr_5y), valueB: num(scoreB?.revenue_cagr_5y), direction: "higher", format: fmtCagrSafe },
      // Faithfully reproduces TickerPageContent.tsx's existing label/field
      // mismatch: the row labeled "EBITDA" reads net_income_cagr_5y, not a
      // dedicated EBITDA CAGR field. Not "fixed" here so Compare agrees with
      // the real ticker page rather than silently disagreeing with it.
      { label: "EBITDA CAGR (5Y)", valueA: num(scoreA?.net_income_cagr_5y), valueB: num(scoreB?.net_income_cagr_5y), direction: "higher", format: fmtCagrSafe },
      { label: "FCF CAGR (5Y)", valueA: num(scoreA?.fcf_cagr_5y), valueB: num(scoreB?.fcf_cagr_5y), direction: "higher", format: fmtCagrSafe },
      { label: "GROWTH SCORE", valueA: num(scoreA?.growth_score), valueB: num(scoreB?.growth_score), direction: "higher", band: 0, format: fmtNumSafe },
    ],
  }
}

function financialHealthSection(scoreA: Score | null, scoreB: Score | null): CompareSection {
  const checksA = healthChecks(scoreA)
  const checksB = healthChecks(scoreB)
  const n = Math.max(checksA.length, checksB.length)
  const rows: CompareMetricRow[] = []
  for (let i = 0; i < n; i++) {
    const a = checksA[i]
    const b = checksB[i]
    const label = a?.name ?? b?.name ?? `CHECK ${i + 1}`
    rows.push({ label, valueA: a?.pass ?? null, valueB: b?.pass ?? null, direction: "pass-fail" })
  }
  rows.push({ label: "HEALTH SCORE", valueA: num(scoreA?.health_score), valueB: num(scoreB?.health_score), direction: "higher", band: 0, format: fmtNumSafe })
  return { title: "LAYER 3 — FINANCIAL HEALTH", rows }
}

function finalScoreSection(scoreA: Score | null, scoreB: Score | null): CompareSection {
  return {
    title: "LAYER 4 — FINAL SCORE",
    rows: [
      { label: "FINAL SCORE", valueA: num(scoreA?.final_score), valueB: num(scoreB?.final_score), direction: "higher", band: 0, format: fmtNumSafe },
      { label: "GROWTH SCORE", valueA: num(scoreA?.growth_score), valueB: num(scoreB?.growth_score), direction: "higher", band: 0, format: fmtNumSafe },
      { label: "HEALTH SCORE", valueA: num(scoreA?.health_score), valueB: num(scoreB?.health_score), direction: "higher", band: 0, format: fmtNumSafe },
      { label: "PPM SCORE", valueA: num(scoreA?.ppm_score), valueB: num(scoreB?.ppm_score), direction: "higher", band: 0, format: fmtNumSafe },
      { label: "SIGNAL", valueA: scoreA?.signal ?? null, valueB: scoreB?.signal ?? null, direction: "none" },
    ],
  }
}

// mode: which "Stock B" source feeds this section --
//  - 'stock'    -> scoreB is a real second ticker's stock_scores row
//  - 'sp500'    -> scoreB is synthesized from the SP500_* constants (per A's own sector_override)
//  - 'industry' -> scoreB is synthesized from A's own industry_* columns
function marketComparisonSection(scoreA: Score | null, scoreBReal: Score | null, mode: Mode): CompareSection {
  const a = marketComparisonFields(scoreA)

  let primaryB: number | null
  let primary5yB: number | null
  let fcfB: number | null
  let fcf5yB: number | null
  let divB: number | null
  let div5yB: number | null

  if (mode === "STOCK_VS_STOCK") {
    const b = marketComparisonFields(scoreBReal)
    primaryB = b.primaryCurrent
    primary5yB = b.primary5yAvg
    fcfB = b.fcfYield
    fcf5yB = b.fcf5yAvg
    divB = b.divYield
    div5yB = b.div5yAvg
  } else if (mode === "STOCK_VS_SP500") {
    primaryB = a.sp500PrimaryNow
    primary5yB = a.sp500Primary5y
    fcfB = SP500_FCF_NOW
    fcf5yB = SP500_FCF_5Y
    divB = SP500_DIV_NOW
    div5yB = SP500_DIV_5Y
  } else {
    primaryB = a.industryPrimary
    primary5yB = a.industryPrimary5y
    fcfB = a.industryFcf
    fcf5yB = a.industryFcf5y
    divB = a.industryDiv
    div5yB = a.industryDiv5y
  }

  return {
    title: "MARKET COMPARISON",
    rows: [
      { label: `${a.primaryLabel} CURRENT`, valueA: a.primaryCurrent, valueB: primaryB, direction: "lower", format: fmtPeSafe },
      { label: `${a.primaryLabel} 5Y AVG`, valueA: a.primary5yAvg, valueB: primary5yB, direction: "lower", format: fmtPeSafe },
      { label: "FCF YIELD CURRENT", valueA: a.fcfYield, valueB: fcfB, direction: "higher", format: fmtYldSafe },
      { label: "FCF YIELD 5Y AVG", valueA: a.fcf5yAvg, valueB: fcf5yB, direction: "higher", format: fmtYldSafe },
      { label: "DIV YIELD CURRENT", valueA: a.divYield, valueB: divB, direction: "higher", format: fmtYldSafe },
      { label: "DIV YIELD 5Y AVG", valueA: a.div5yAvg, valueB: div5yB, direction: "higher", format: fmtYldSafe },
    ],
  }
}

// Thin type-narrowing wrappers around lib/format.ts -- CompareMetricRow's
// value type is widened to number|boolean|string|null (to also hold text
// rows and pass/fail booleans), so these guard to number before delegating
// to the real formatters rather than reimplementing their rounding rules.
function fmtDollarSafe(v: number | boolean | string | null) {
  return typeof v === "number" ? fmtDollar(v) : "—"
}
function fmtCagrSafe(v: number | boolean | string | null) {
  return typeof v === "number" ? fmtCagr(v) : "—"
}
function fmtPeSafe(v: number | boolean | string | null) {
  return typeof v === "number" ? fmtPe(v) : "—"
}
function fmtYldSafe(v: number | boolean | string | null) {
  return typeof v === "number" ? fmtYld(v) : "—"
}
// No lib/format.ts equivalent exists for these two -- new, not duplicates.
function fmtMultSafe(v: number | boolean | string | null) {
  return typeof v === "number" ? `${v.toFixed(2)}x` : "—"
}
function fmtNumSafe(v: number | boolean | string | null) {
  return typeof v === "number" ? v.toFixed(1) : "—"
}

export async function getCompareData(mode: Mode, tickerA: string, tickerB: string | null): Promise<CompareResult> {
  const a = await fetchTicker(tickerA)
  if (!a) return { ok: false, error: "not_found", ticker: tickerA }

  let b: Awaited<ReturnType<typeof fetchTicker>> | null = null
  if (mode === "STOCK_VS_STOCK") {
    if (!tickerB) return { ok: false, error: "not_found", ticker: "" }
    b = await fetchTicker(tickerB)
    if (!b) return { ok: false, error: "not_found", ticker: tickerB }
  }

  const currentPriceA = num(a.price?.current_price)
  const currentPriceB = b ? num(b.price?.current_price) : null

  const labelA = tickerA
  const labelB = mode === "STOCK_VS_STOCK" ? (tickerB as string) : mode === "STOCK_VS_SP500" ? "S&P 500" : "INDUSTRY AVG"

  const sections: CompareSection[] = [
    overviewSection(a.stock, a.price, a.score, b?.stock ?? null, b?.price ?? null, b?.score ?? null),
  ]

  if (mode === "STOCK_VS_STOCK") {
    sections.push(
      priceProjectionSection(a.score, currentPriceA, b?.score ?? null, currentPriceB),
      growthQualitySection(a.score, b?.score ?? null),
      financialHealthSection(a.score, b?.score ?? null),
      finalScoreSection(a.score, b?.score ?? null),
    )
  } else if (mode === "STOCK_VS_SP500") {
    // S&P 500 benchmark data only exists for the CAGR/return row
    // (score.sp500_cagr/sp500_5y_return) and the Market Comparison constants
    // -- no synthetic "S&P 500 stock_scores row" exists to drive Growth
    // Quality / Financial Health / the other Price Projection rows, so this
    // mode only adds the trimmed price-projection-vs-S&P section (same
    // "hide what has no real data" reasoning Tong gave for STOCK_VS_INDUSTRY).
    sections.push(priceProjectionVsSp500Section(a.score, currentPriceA))
  }
  // STOCK_VS_INDUSTRY: only Overview + Market Comparison, per Tong's answer.

  sections.push(marketComparisonSection(a.score, b?.score ?? null, mode))

  const tally = tallyWins(sections)

  return { ok: true, labelA, labelB, sections, tally }
}
