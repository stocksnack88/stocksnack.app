import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";
import BackButton from "@/components/ui/BackButton";
import UpgradeButton from "@/components/ui/UpgradeButton";
import DescriptionToggle from "@/components/ui/DescriptionToggle";
import HealthCategories, { type FundRow as HealthFundRow } from "@/components/ui/HealthCategories";
import SegmentBreakdown from "@/components/ui/SegmentBreakdown";
import HazardTooltip from "@/components/ui/HazardTooltip";
import ShareButton from "@/components/ui/ShareButton";
import { LayerProvider, CollapsibleLayer, CollapsibleSectionHeader, ExpandCollapseButton, ChildCollapsibleLayer } from "@/components/ui/LayersAccordion";
import { getDailyFreeTickers } from "@/lib/free-stocks";

const FREE_LIMIT = 5;

const HEALTH_CATEGORIES = [
  { label: "5Y BALANCE SHEET", count: 7 },
  { label: "5Y INCOME STATEMENT", count: 7 },
  { label: "5Y CASH FLOW", count: 5 },
  { label: "BUSINESS TRAITS", count: 5 },
] as const;

type HealthCheck = {
  name: string;
  pass: boolean;
  score: number;
  years_passed: number;
  not_scored?: boolean;
};


function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  const decimals = abs < 10 ? 2 : abs < 100 ? 1 : 0;
  return `${n.toFixed(decimals)}%`;
}

function fmtDollar(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs < 10) return `$${n.toFixed(2)}`;
  if (abs < 100) return `$${n.toFixed(1)}`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtCagr(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return fmtPct(n * 100);
}

function fmtBn(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const bn = n / 1_000_000_000;
  if (Math.abs(bn) >= 100) return `$${Math.round(bn).toLocaleString("en-US")}bn`;
  if (Math.abs(bn) >= 10)  return `$${bn.toFixed(1)}bn`;
  return `$${bn.toFixed(2)}bn`;
}

function scoreColor(v: number | null | undefined): string {
  if (!v && v !== 0) return "#666";
  return v >= 70 ? "#00ff41" : v >= 45 ? "#f59e0b" : "#ef4444";
}

function healthColor(v: number | null | undefined): string {
  if (v == null) return "#666";
  return v >= 75 ? "#00ff41" : v >= 50 ? "#f59e0b" : "#ef4444";
}


function SignalBadge({ signal }: { signal: string | null | undefined }) {
  const s = (signal ?? "").toUpperCase();
  const map: Record<string, React.CSSProperties> = {
    "BUY+": { background: "rgba(0,255,65,0.25)", color: "#00ff41", border: "1px solid rgba(0,255,65,0.9)" },
    BUY:   { background: "rgba(0,255,65,0.15)", color: "#00ff41", border: "1px solid rgba(0,255,65,0.6)" },
    HOLD:  { background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.5)" },
    SELL:  { background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.5)" },
  };
  return (
    <span
      className="inline-block px-3 py-1 rounded text-sm font-bold tracking-widest"
      style={map[s] ?? { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
    >
      {s || "—"}
    </span>
  );
}

const mono = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" };

export default async function StockDetailPage({ params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase();

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );
  const { data: { session } } = await supabase.auth.getSession();

  // Daily free tickers — same date-seeded algorithm as the screener list
  const { data: allTickerRows } = await supabaseAdmin
    .from("stock_scores")
    .select("ticker, signal");
  const freeTickers = getDailyFreeTickers(
    (allTickerRows ?? []).map((r: { ticker: string; signal: string | null }) => ({
      ticker: r.ticker,
      signal: r.signal,
    })),
    FREE_LIMIT,
  );

  const TRIAL_DURATION_MS = 5 * 60 * 1000;
  const EXTENSION_DURATION_MS = 15 * 60 * 1000;
  let isPro = false;
  let isTrialActive = false;
  if (session?.user?.id) {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("subscription_status, trial_used, trial_started_at, trial_extension_started_at")
      .eq("id", session.user.id)
      .single();
    isPro =
      profile?.subscription_status === "active" ||
      profile?.subscription_status === "trialing";
    const trialStartedAt = profile?.trial_started_at ?? null;
    const trialExtensionStartedAt = profile?.trial_extension_started_at ?? null;
    const trialElapsed = trialStartedAt ? Date.now() - new Date(trialStartedAt).getTime() : Infinity;
    const extensionElapsed = trialExtensionStartedAt ? Date.now() - new Date(trialExtensionStartedAt).getTime() : Infinity;
    isTrialActive =
      (!isPro && profile?.trial_used !== true && trialStartedAt !== null && trialElapsed < TRIAL_DURATION_MS) ||
      (!isPro && trialExtensionStartedAt !== null && extensionElapsed < EXTENSION_DURATION_MS);
  }

  const [stockRes, priceRes, scoreRes, fundRes] = await Promise.all([
    supabaseAdmin.from("stocks").select("*").eq("ticker", ticker).single(),
    supabaseAdmin.from("stock_prices").select("*").eq("ticker", ticker).single(),
    supabaseAdmin.from("stock_scores").select("*").eq("ticker", ticker).single(),
    supabaseAdmin.from("stock_fundamentals")
      .select("fiscal_year,revenue,ebitda,free_cash_flow,gross_margin,operating_income,net_income,eps,total_assets,total_debt,total_equity,cash_and_equivalents,operating_cash_flow,capex,dividends_paid,buybacks,net_margin,roe,roic,debt_to_equity,interest_coverage,market_cap_at_year,sga,rd_expense,tax_rate,sbc,shares_outstanding,intangibles,preferred_stock")
      .eq("ticker", ticker)
      .order("fiscal_year", { ascending: true })
      .limit(5),
  ]);

  if (stockRes.error && scoreRes.error) return notFound();

  const stock = stockRes.data;
  const price = priceRes.data;
  const score = scoreRes.data;
  const fundamentals = fundRes.data ?? [];
  const canAccess = isPro || isTrialActive || freeTickers.has(ticker);

  // ── Paywall ──────────────────────────────────────────────────────────────────
  if (!canAccess) {
    return (
      <div className="bg-black" style={mono}>
        <div className="border-b px-6 py-3" style={{ borderColor: "rgba(0,255,65,0.1)" }}>
          <BackButton />
        </div>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <p className="text-5xl mb-6" style={{ color: "rgba(0,255,65,0.15)" }}>⊘</p>
          <h2 className="text-sm font-bold tracking-widest mb-2" style={{ color: "#00ff41" }}>
            PRO FEATURE
          </h2>
          <p className="text-xs mb-1" style={{ color: "rgba(0,255,65,0.5)" }}>
            {ticker}{stock?.name ? ` · ${stock.name}` : ""}
          </p>
          <p className="text-xs max-w-xs leading-relaxed mb-8" style={{ color: "rgba(0,255,65,0.35)" }}>
            Upgrade to Pro to unlock all 500 stocks with full breakdowns.
          </p>
          <UpgradeButton />
          {!session && (
            <p className="mt-4 text-xs" style={{ color: "rgba(0,255,65,0.3)" }}>
              Already have an account?{" "}
              <Link href="/login" className="underline" style={{ color: "rgba(0,255,65,0.6)" }}>
                Sign in
              </Link>
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Parse health checks into 4 categories ────────────────────────────────────
  const rawChecks: HealthCheck[] = Array.isArray(score?.health_details)
    ? (score.health_details as HealthCheck[])
    : [];
  let offset = 0;
  const healthCats = HEALTH_CATEGORIES.map((cat) => {
    const checks = rawChecks.slice(offset, offset + cat.count);
    offset += cat.count;
    return { ...cat, checks };
  });
  const scoredTotal = rawChecks.filter((c) => !c.not_scored).length || 24;

  const currentPrice: number | null = price?.current_price ?? null;
  const blendedPrice: number | null = score?.ppm_blended_price ?? null;

  type Segment = { name: string; pct: number; cagr: number | null; value: number };
  type ScoreExtras = {
    sp500_cagr?: number | null;
    sp500_5y_return?: number | null;
    product_segments?: Segment[];
    geo_segments?: Segment[];
    m1_ebitda_current?: number | null;
    m1_ebitda_projected?: number | null;
    m1_growth_rate?: number | null;
    m1_ev_ebitda_multiple?: number | null;
    m1_net_debt?: number | null;
    m1_shares?: number | null;
    m2_fcf_current?: number | null;
    m2_fcf_projected?: number | null;
    m2_growth_rate?: number | null;
    m2_fcf_yield?: number | null;
    m3_div_yield?: number | null;
    m3_buyback_yield?: number | null;
    m3_shareholder_yield?: number | null;
    m3_growth_rate?: number | null;
    m_cumulative_div_ps?: number | null;
    gq_signal_revenue?: string | null;
    gq_signal_net_income?: string | null;
    gq_signal_fcf?: string | null;
    has_anomaly?: boolean | null;
    anomaly_reasons?: string | null;
  };
  const scoreEx = score as (NonNullable<typeof score> & ScoreExtras) | null;

  return (
    <div className="bg-black" style={mono}>
      {/* Breadcrumb */}
      <div className="border-b px-6 py-3" style={{ borderColor: "rgba(0,255,65,0.1)" }}>
        <BackButton />
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* ── Company header ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <h1 className="text-3xl font-bold tracking-[0.2em]" style={{ color: "#00ff41" }}>
                {ticker}
              </h1>
              <SignalBadge signal={score?.signal} />
              {scoreEx?.has_anomaly && (
                <HazardTooltip
                  reasons={(scoreEx.anomaly_reasons ?? "").split(", ").filter(Boolean)}
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
        <LayerProvider count={12} briefExpand={{ startMs: 400, durationMs: 800 }} defaultOpenIds={[5]} childMap={{ 0: [6, 7, 8], 1: [9, 10, 11] }}>
          <div className="flex items-center justify-end gap-2">
            <ShareButton
              ticker={ticker}
              companyName={stock?.name ?? null}
              signal={score?.signal ?? null}
              projectedReturn={blendedPrice != null && currentPrice != null && currentPrice > 0 ? blendedPrice / currentPrice : null}
              cagr={score?.ppm_cagr != null ? Number(score.ppm_cagr) : null}
              growthScore={score?.growth_score != null ? Number(score.growth_score) : null}
              healthPasses={score?.health_passes ?? null}
              scoredTotal={scoredTotal}
              finalScore={score?.final_score != null ? Number(score.final_score) : null}
            />
            <ExpandCollapseButton />
          </div>

          {/* Overview */}
          <CollapsibleSectionHeader id={0} label="OVERVIEW">

          {/* Price projection */}
          <ChildCollapsibleLayer id={6} header={
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>PRICE PROJECTION</p>
          }>
          <div className="px-5 py-4">
            <p className="text-[11px] font-bold tracking-widest mb-3" style={{ color: "#00ff41" }}>{ticker} Price In 5 Years (Projected)</p>
            <div className="flex items-center gap-4">
              <div className="flex-1 text-center">
                <p className="text-xs tracking-widest mb-1" style={{ color: "rgba(0,255,65,0.4)" }}>CURRENT PRICE</p>
                <p className="text-2xl font-bold font-mono" style={{ color: "#00ff41" }}>
                  {fmtDollar(currentPrice)}
                </p>
              </div>
              <div className="flex flex-col items-center justify-center shrink-0 gap-0.5">
                <p className="text-[9px] font-bold tracking-[0.2em]" style={{ color: "rgba(0,255,65,0.5)" }}>
                  {score?.ppm_cagr != null ? `CAGR (5Y) ${fmtCagr(score.ppm_cagr)}` : ""}
                </p>
                <p className="text-2xl font-mono" style={{ color: "rgba(0,255,65,0.3)" }}>→</p>
                <p className="text-[9px] font-bold tracking-[0.2em]" style={{ color: "rgba(0,255,65,0.5)" }}>
                  {currentPrice && blendedPrice ? `${(blendedPrice / currentPrice).toFixed(1)}x` : ""}
                </p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-xs tracking-widest mb-1" style={{ color: "rgba(0,255,65,0.4)" }}>PROJECTED (5Y)</p>
                <p className="text-2xl font-bold font-mono" style={{ color: "#00ff41" }}>
                  {fmtDollar(blendedPrice)}
                </p>
              </div>
            </div>
          </div>
          </ChildCollapsibleLayer>

          {/* ── Scorecard ────────────────────────────────────────────────────── */}
          <ChildCollapsibleLayer id={7} header={
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>WHAT YOU ARE BUYING</p>
          }>
          {(() => {
            // 5Y RETURN color
            const stockMult = currentPrice && blendedPrice ? blendedPrice / currentPrice : null;
            const sp500Mult = scoreEx?.sp500_5y_return != null ? Number(scoreEx.sp500_5y_return) : null;
            const multDiff  = stockMult != null && sp500Mult != null ? stockMult - sp500Mult : null;
            const multColor = multDiff == null ? "#00ff41"
              : Math.abs(multDiff) <= 0.1 ? "#f59e0b"
              : multDiff > 0 ? "#00ff41" : "#ef4444";
            // CAGR color
            const ppmCagrN  = score?.ppm_cagr  != null ? Number(score.ppm_cagr)        : null;
            const sp500CagrN = scoreEx?.sp500_cagr != null ? Number(scoreEx.sp500_cagr) : null;
            const cagrDiff  = ppmCagrN != null && sp500CagrN != null ? ppmCagrN - sp500CagrN : null;
            const cagrColor = cagrDiff == null ? "#00ff41"
              : Math.abs(cagrDiff) <= 0.01 ? "#f59e0b"
              : cagrDiff > 0 ? "#00ff41" : "#ef4444";
            // Growth Quality color
            const gq = score?.growth_score != null ? Number(score.growth_score) : null;
            const gqColor = gq == null ? "#00ff41" : gq >= 75 ? "#00ff41" : gq >= 50 ? "#f59e0b" : "#ef4444";
            // Financial Health color
            const hp = score?.health_passes != null ? Number(score.health_passes) : null;
            const healthRatio = hp != null ? hp / scoredTotal : null;
            const healthColor2 = healthRatio == null ? "#00ff41"
              : healthRatio >= 0.75 ? "#00ff41" : healthRatio >= 0.50 ? "#f59e0b" : "#ef4444";
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
                    <span style={{ color: cagrColor }}>{fmtCagr(score?.ppm_cagr)}</span>
                    <span className="mx-2" style={{ color: "rgba(0,255,65,0.3)" }}>vs</span>
                    <span style={{ color: "rgba(0,255,65,0.4)" }}>
                      {sp500CagrN != null ? fmtCagr(scoreEx?.sp500_cagr) : "—"}
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
            ));
          })()}
          </ChildCollapsibleLayer>

          {/* ── About the Business ──────────────────────────────────────────────── */}
          <ChildCollapsibleLayer id={8} header={
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>ABOUT THE BUSINESS</p>
          }>
          {(() => {
          const rawProduct = scoreEx != null ? scoreEx.product_segments : undefined;
          const rawGeo     = scoreEx != null ? scoreEx.geo_segments     : undefined;
          const productSegs: Segment[] = Array.isArray(rawProduct) ? rawProduct : [];
          const geoSegs: Segment[]     = Array.isArray(rawGeo)     ? rawGeo     : [];
          if (!stock?.description && !productSegs.length && !geoSegs.length) return null;
          return (
            <>

              {/* Company Description */}
              {stock?.description && (
                <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
                  <p className="text-xs font-bold tracking-widest mb-3" style={{ color: "rgba(0,255,65,0.4)" }}>COMPANY DESCRIPTION</p>
                  <DescriptionToggle text={stock.description} />
                </div>
              )}

              {/* Product Revenue */}
              {productSegs.length > 0 && (
                <SegmentBreakdown
                  title="PRODUCT BREAKDOWN"
                  segs={productSegs}
                  borderedBottom={geoSegs.length > 0}
                />
              )}

              {/* Geographic Revenue */}
              {geoSegs.length > 0 && (
                <SegmentBreakdown title="GEOGRAPHIC BREAKDOWN" segs={geoSegs} />
              )}
            </>
          );
          })()}
          <p className="text-center text-xs py-4 tracking-wide" style={{ color: "rgba(0,255,65,0.2)", borderTop: "1px solid rgba(0,255,65,0.1)" }}>
            DATA · FINANCIALMODELINGPREP · SCORES UPDATED WEEKLY
          </p>
          </ChildCollapsibleLayer>
          </CollapsibleSectionHeader>

          {/* Market Comparison */}
          <CollapsibleSectionHeader id={1} label="MARKET COMPARISON">
          {(() => {
          // ── Data ──────────────────────────────────────────────────────────────
          const peRatio      = score?.pe_ratio          != null ? Number(score.pe_ratio)          : null;
          const pe5yAvg      = score?.pe_5y_avg          != null ? Number(score.pe_5y_avg)          : null;
          const industryPe   = score?.industry_pe        != null ? Number(score.industry_pe)        : null;
          const industryPe5y = score?.industry_pe_5y_avg != null ? Number(score.industry_pe_5y_avg) : null;
          const fcfYield       = score?.fcf_yield           != null ? Number(score.fcf_yield)           : null;
          const fcf5yAvg       = score?.fcf_5y_avg          != null ? Number(score.fcf_5y_avg)          : null;
          const industryFcf    = score?.industry_fcf_yield     != null ? Number(score.industry_fcf_yield)     : null;
          const industryFcf5y  = score?.industry_fcf_5y_avg   != null ? Number(score.industry_fcf_5y_avg)   : null;
          const divYield       = score?.div_yield              != null ? Number(score.div_yield)              : null;
          const div5yAvg       = score?.div_yield_5y_avg       != null ? Number(score.div_yield_5y_avg)       : null;
          const industryDiv    = score?.industry_div_yield     != null ? Number(score.industry_div_yield)     : null;
          const industryDiv5y  = score?.industry_div_yield_5y_avg != null ? Number(score.industry_div_yield_5y_avg) : null;

          // S&P 500 benchmarks (hardcoded — live data later)
          const SP500_PE_NOW = 22;    const SP500_PE_5Y  = 19;
          const SP500_FCF_NOW = 0.035; const SP500_FCF_5Y  = 0.032;
          const SP500_DIV_NOW = 0.013; const SP500_DIV_5Y  = 0.018;

          const fmtPe  = (n: number | null) => n != null ? `${n.toFixed(1)}x`              : "—";
          const fmtYld = (n: number | null) => n != null ? `${(n * 100).toFixed(2)}%`      : "—";

          // ── Bar chart ────────────────────────────────────────────────────────
          type BarGroup = { label: string; cur: number | null; avg: number | null; isStock?: boolean };

          function renderBarChart(groups: BarGroup[], stockNow: number | null, fmt: (n: number | null) => string) {
            if (stockNow == null) return null;
            const allVals = groups.flatMap(g => [g.cur, g.avg]).filter((v): v is number => v != null && v > 0);
            const maxVal  = allVals.length > 0 ? Math.max(...allVals) : 0;
            if (maxVal === 0) return null;

            const H      = 90;  // chart height px
            const BAR_W  = 14;
            const BAR_GAP = 4;
            const GRP_GAP = 20;
            const AXIS_W  = 32;

            const px = (v: number | null) => v != null && v > 0 ? Math.round((v / maxVal) * H) : 0;
            const refPx = Math.round((stockNow / maxVal) * H);
            const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

            return (
              <div style={{ fontFamily: "var(--font-geist-mono),'Courier New',monospace", userSelect: "none" }}>
                {/* Chart row */}
                <div style={{ display: "flex" }}>
                  {/* Y-axis */}
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

                  {/* Bars + grid */}
                  <div style={{ flex: 1, height: H, position: "relative" }}>
                    {/* Grid lines */}
                    {yTicks.map(f => (
                      <div key={f} style={{
                        position: "absolute", left: 0, right: 0, bottom: `${f * 100}%`, height: 1,
                        background: f === 0 ? "rgba(0,255,65,0.25)" : "rgba(0,255,65,0.07)",
                      }} />
                    ))}

                    {/* Reference line */}
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

                    {/* Bar groups */}
                    <div style={{ display: "flex", alignItems: "flex-end", height: "100%", gap: GRP_GAP, paddingLeft: 4, paddingRight: 4 }}>
                      {groups.map(g => {
                        const isStock    = g.isStock ?? false;
                        const curColor   = isStock ? "#00ff41"
                          : (g.cur != null && g.cur > stockNow ? "#ef4444" : "#00ff41");
                        const avgColor   = isStock ? "rgba(0,255,65,0.28)"
                          : (g.avg != null && g.avg > stockNow ? "rgba(239,68,68,0.28)" : "rgba(0,255,65,0.28)");
                        return (
                          <div key={g.label} style={{ display: "flex", alignItems: "flex-end", gap: BAR_GAP, flexShrink: 0 }}>
                            <div style={{ width: BAR_W, height: px(g.cur),  background: curColor }} />
                            <div style={{ width: BAR_W, height: px(g.avg),  background: avgColor }} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* X-axis labels */}
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
            );
          }

          // ── Status badge ─────────────────────────────────────────────────────
          function calcBadge(cur: number | null, them: number | null, inverse: boolean) {
            if (cur == null || them == null) return null;
            if (inverse) {
              if (cur > them * 1.1) return { label: "CHEAPER",   color: "#00ff41" };
              if (cur < them * 0.9) return { label: "EXPENSIVE", color: "#ef4444" };
              return                       { label: "FAIR",      color: "#f59e0b" };
            }
            if (cur > them * 1.1)   return { label: "EXPENSIVE", color: "#ef4444" };
            if (cur < them * 0.9)   return { label: "CHEAPER",   color: "#00ff41" };
            return                         { label: "FAIR",      color: "#f59e0b" };
          }

          // ── Comparison table ─────────────────────────────────────────────────
          type TableRow = { label: string; them: number | null };

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
            };
            const tdStyle: React.CSSProperties = {
              fontSize: 11, fontFamily: "inherit",
              padding: "5px 0", borderBottom: "1px solid rgba(0,255,65,0.07)",
            };
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
                    const b = calcBadge(current, r.them, inverse);
                    const isLast = i === rows.length - 1;
                    const noBottom = isLast ? { borderBottom: "none" } : {};
                    const cmpStr = (
                      <div style={{ display: "grid", gridTemplateColumns: "52px 24px 52px", gap: 0 }}>
                        <span style={{ textAlign: "right",  color: current != null ? "#00ff41" : "rgba(0,255,65,0.2)", fontWeight: 700 }}>{fmt(current)}</span>
                        <span style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 9 }}>vs</span>
                        <span style={{ textAlign: "left",   color: r.them  != null ? "rgba(0,255,65,0.5)" : "rgba(0,255,65,0.2)" }}>{fmt(r.them)}</span>
                      </div>
                    );
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
                    );
                  })}
                </tbody>
              </table>
            );
          }

          // ── Verdict ──────────────────────────────────────────────────────────
          function getVerdict(current: number | null, rows: TableRow[], inverse: boolean, metricType: "pe" | "fcf" | "div"): string | null {
            if (current == null) return null;
            const badges = rows.map(r => calcBadge(current, r.them, inverse)).filter(Boolean) as { label: string; color: string }[];
            if (badges.length === 0) return null;
            if (metricType === "pe") {
              const exp   = badges.filter(b => b.label === "EXPENSIVE").length;
              const cheap = badges.filter(b => b.label === "CHEAPER").length;
              if (exp >= 3)   return "Priced at a premium — you're paying more than most benchmarks suggest it's worth.";
              if (exp >= 2)   return "Slightly expensive compared to a few benchmarks — worth watching.";
              if (cheap >= 3) return "Looks cheap across the board — could be a good entry point.";
              if (cheap >= 2) return "Underpriced against a few benchmarks — potentially good value.";
              return "Fairly priced — nothing screaming buy or sell here.";
            } else if (metricType === "fcf") {
              const high = badges.filter(b => b.label === "CHEAPER").length;
              const low  = badges.filter(b => b.label === "EXPENSIVE").length;
              if (high >= 3)  return "Strong cash generation relative to price — the business is throwing off a lot of free cash.";
              if (high >= 2)  return "Above-average FCF yield compared to a few benchmarks — decent cash returns.";
              if (low >= 3)   return "Weak FCF yield across the board — not much cash being returned relative to what you're paying.";
              if (low >= 2)   return "FCF yield trails a few benchmarks — moderate cash generation for the price.";
              return "FCF yield is in line with what you'd expect — nothing unusual here.";
            } else {
              const high = badges.filter(b => b.label === "CHEAPER").length;
              const low  = badges.filter(b => b.label === "EXPENSIVE").length;
              if (high >= 3)  return "High dividend yield across the board — stands out as an income play.";
              if (high >= 2)  return "Pays more than a few benchmarks — solid income relative to price.";
              if (low >= 3)   return "Low dividend yield across the board — not an income-focused stock.";
              if (low >= 2)   return "Dividend yield is below a few benchmarks — modest income.";
              return "Dividend yield is about average — nothing exceptional either way.";
            }
          }

          // ── Metric block ─────────────────────────────────────────────────────
          function renderMetric(
            title: string,
            current: number | null,
            groups: BarGroup[],
            tableRows: TableRow[],
            fmt: (n: number | null) => string,
            inverse: boolean,
            metricType: "pe" | "fcf" | "div",
            id: number,
          ) {
            const verdict = getVerdict(current, tableRows, inverse, metricType);
            return (
              <ChildCollapsibleLayer key={title} id={id} header={
                <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>{title}</p>
              }>
                <div className="px-5 py-5" style={{ fontFamily: "var(--font-geist-mono),'Courier New',monospace" }}>
                  {/* Bar chart */}
                  {renderBarChart(groups, current, fmt)}

                  {/* Legend */}
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

                  {/* Divider */}
                  <div style={{ height: 1, background: "rgba(0,255,65,0.1)", marginBottom: 14 }} />

                  {/* Comparison table */}
                  {renderTable(current, fmt, tableRows, inverse)}

                  {/* Verdict */}
                  {verdict && (
                    <p style={{ marginTop: 10, fontSize: 11, color: "rgba(0,255,65,0.5)", lineHeight: 1.5 }}>
                      {verdict}
                    </p>
                  )}
                </div>
              </ChildCollapsibleLayer>
            );
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
                fmtPe, false, "pe", 9,
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
                fmtYld, true, "fcf", 10,
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
                fmtYld, true, "div", 11,
              )}
            </>
          );
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
          )}>

          {/* Compact summary row */}
          <p className="text-center text-[9px] font-mono tracking-widest py-2.5" style={{ color: "rgba(0,255,65,0.45)", borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
            {score?.ppm_cagr != null ? `~${(Number(score.ppm_cagr) * 100).toFixed(1)}% PER YEAR` : "—"}
            {" · "}
            {currentPrice && blendedPrice ? `~${(blendedPrice / currentPrice).toFixed(1)}x RETURN` : "—"}
          </p>

          {/* 3 method cards — flat CSS grid: each step is a shared row across all 3 columns */}
          {(() => {
            const m3na = scoreEx?.m3_applicable === false || !score?.ppm_m3_price || Number(score.ppm_m3_price) === 0 || (scoreEx?.m3_div_yield != null && Number(scoreEx.m3_div_yield) < 0.04);
            const m2na = !score?.ppm_m2_price || Number(score.ppm_m2_price) === 0;
            const m2NotApplicableReason = (() => {
              const override = score?.sector_override;
              if (override === 'Bank' || override === 'Financial') return 'FCF excluded for financial sector';
              if (override === 'REIT') return 'FCF not meaningful for REITs';
              if (score?.m2_fcf_current !== null && score?.m2_fcf_current !== undefined && Number(score.m2_fcf_current) < 0)
                return 'Negative FCF — capex exceeds operating cash';
              return 'Insufficient FCF data';
            })();
            const stepBox = "border border-[rgba(0,255,65,0.1)] rounded p-1 text-center";
            const cb  = "border-r border-[rgba(0,255,65,0.1)]"; // column divider for M1 and M2 cells
            const cumDivPs = scoreEx?.m_cumulative_div_ps != null ? Number(scoreEx.m_cumulative_div_ps) : 0;
            const divLabel = `+ $${cumDivPs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} dividends received over 5Y`;
            const arrow = (op: string) => (
              <div className="text-center text-[9px] leading-none py-0.5" style={{ color: `rgba(0,255,65,${op})` }}>↓</div>
            );

            // M3 derived values (all null when M3 is N/A)
            const m3Shares         = scoreEx?.m1_shares != null ? Number(scoreEx.m1_shares) : null;
            const m3AnnualDivPs    = cumDivPs > 0 ? cumDivPs / 5 : null;
            const m3CurTotalDiv    = m3AnnualDivPs != null && m3Shares != null ? m3AnnualDivPs * m3Shares : null;
            const m3GrowthRate     = scoreEx?.m3_growth_rate != null ? Number(scoreEx.m3_growth_rate) : null;
            const m3Proj5yTotalDiv = m3CurTotalDiv != null && m3GrowthRate != null
              ? m3CurTotalDiv * Math.pow(1 + m3GrowthRate, 5) : null;

            return (
              <div className="grid grid-cols-3 items-start" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>

                {/* ── ROW 1: Method headers ── */}
                <div className={`px-3 pt-2 pb-1 text-center ${cb}`}>
                  <p className="text-xs tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.2)" }}>METHOD 1</p>
                  <p className="text-xs font-bold tracking-wider" style={{ color: "#00ff41" }}>EARNINGS GROWTH</p>
                </div>
                <div className={`px-3 pt-2 pb-1 text-center ${cb} ${m2na ? "opacity-40" : ""}`}>
                  <p className="text-xs tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.2)" }}>METHOD 2</p>
                  <p className="text-xs font-bold tracking-wider" style={{ color: "#00ff41" }}>FREE CASH FLOW</p>
                </div>
                <div className={`px-3 pt-2 pb-1 text-center ${m3na ? "opacity-40" : ""}`}>
                  <p className="text-xs tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.2)" }}>METHOD 3</p>
                  <p className="text-xs font-bold tracking-wider" style={{ color: "#00ff41" }}>DIVIDENDS</p>
                </div>

                {/* ── ROW 2: Step [1] — Current Price ── */}
                <div className={`px-3 py-1 ${cb}`}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[1]</span> CURRENT PRICE</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(currentPrice)}</p>
                </div></div>
                {m2na ? (
                  <div className={`px-3 py-1 ${cb} opacity-40 text-center`}>
                    <p className="text-[9px] font-bold tracking-widest" style={{ color: "rgba(0,255,65,0.7)" }}>NOT APPLICABLE</p>
                    <p className="text-[8px] mt-0.5 leading-tight" style={{ color: "rgba(0,255,65,0.5)" }}>{m2NotApplicableReason}</p>
                  </div>
                ) : (
                  <div className={`px-3 py-1 ${cb}`}><div className={stepBox}>
                    <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[1]</span> CURRENT PRICE</p>
                    <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(currentPrice)}</p>
                  </div></div>
                )}
                {m3na ? (
                  <div className="px-3 py-1 opacity-40 text-center">
                    <p className="text-[9px] font-bold tracking-widest" style={{ color: "rgba(0,255,65,0.7)" }}>NOT APPLICABLE</p>
                    <p className="text-[8px] mt-0.5 leading-tight" style={{ color: "rgba(0,255,65,0.5)" }}>Dividend yield below 4.5% threshold</p>
                  </div>
                ) : (
                  <div className="px-3 py-1"><div className={stepBox}>
                    <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[1]</span> CURRENT PRICE</p>
                    <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(currentPrice)}</p>
                  </div></div>
                )}

                {/* ── ROW 2.5: Arrow ── */}
                <div className={cb}>{arrow("0.25")}</div>
                <div className={cb}>{!m2na && arrow("0.25")}</div>
                <div>{!m3na && arrow("0.25")}</div>

                {/* ── ROW 3: Step [2] ── */}
                <div className={`px-3 py-1 ${cb}`}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[2]</span> CURRENT EBITDA</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtBn(scoreEx?.m1_ebitda_current)}</p>
                </div></div>
                <div className={`px-3 py-1 ${cb}`}>
                  {!m2na && <div className={stepBox}>
                    <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[2]</span> CURRENT FCF</p>
                    <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtBn(scoreEx?.m2_fcf_current)}</p>
                  </div>}
                </div>
                <div className="px-3 py-1">
                  {!m3na && <div className={stepBox}>
                    <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[2]</span> CURRENT ANNUAL DIVIDEND</p>
                    <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtBn(m3CurTotalDiv)}</p>
                  </div>}
                </div>

                {/* ── ROW 3.5: "Growing at" annotation ── */}
                <div className={`px-3 py-0.5 text-center ${cb}`}>
                  <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                    Growing at {scoreEx?.m1_growth_rate != null ? `${(Number(scoreEx.m1_growth_rate) * 100).toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div className={`px-3 py-0.5 text-center ${cb}`}>
                  {!m2na && <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                    Growing at {scoreEx?.m2_growth_rate != null ? `${(Number(scoreEx.m2_growth_rate) * 100).toFixed(1)}%` : "—"}
                  </p>}
                </div>
                <div className="px-3 py-0.5 text-center">
                  {!m3na && <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                    Growing at {m3GrowthRate != null ? `${(m3GrowthRate * 100).toFixed(1)}%` : "—"}
                  </p>}
                </div>

                {/* ── ROW 3.6: Arrow ── */}
                <div className={cb}>{arrow("0.4")}</div>
                <div className={cb}>{!m2na && arrow("0.4")}</div>
                <div>{!m3na && arrow("0.4")}</div>

                {/* ── ROW 4: Step [3] ── */}
                <div className={`px-3 py-1 ${cb}`}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[3]</span> PROJECT 5Y EBITDA</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtBn(scoreEx?.m1_ebitda_projected)}</p>
                </div></div>
                <div className={`px-3 py-1 ${cb}`}>
                  {!m2na && <div className={stepBox}>
                    <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[3]</span> PROJECT 5Y FCF</p>
                    <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtBn(scoreEx?.m2_fcf_projected)}</p>
                  </div>}
                </div>
                <div className="px-3 py-1">
                  {!m3na && <div className={stepBox}>
                    <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[3]</span> PROJECTED 5Y DIVIDEND</p>
                    <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtBn(m3Proj5yTotalDiv)}</p>
                  </div>}
                </div>

                {/* ── ROW 4.5: "At Xx" multiple annotation ── */}
                <div className={`px-3 py-0.5 text-center ${cb}`}>
                  <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                    At {scoreEx?.m1_ev_ebitda_multiple != null ? `${Number(scoreEx.m1_ev_ebitda_multiple).toFixed(0)}x` : "—"} earnings multiple
                  </p>
                </div>
                <div className={`px-3 py-0.5 text-center ${cb}`}>
                  {!m2na && <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                    At {scoreEx?.m2_fcf_yield != null ? `${(Number(scoreEx.m2_fcf_yield) * 100).toFixed(1)}%` : "—"} cash flow yield
                  </p>}
                </div>
                <div className="px-3 py-0.5 text-center">
                  {!m3na && <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                    At {scoreEx?.m3_div_yield != null ? `${(Number(scoreEx.m3_div_yield) * 100).toFixed(1)}%` : "—"} dividend yield
                  </p>}
                </div>

                {/* ── ROW 4.6: Arrow ── */}
                <div className={cb}>{arrow("0.25")}</div>
                <div className={cb}>{!m2na && arrow("0.25")}</div>
                <div>{!m3na && arrow("0.25")}</div>

                {/* ── ROW 5: Step [4] — Estimated Future Price ── */}
                <div className={`px-3 py-1 ${cb}`}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[4]</span> ESTIMATED FUTURE PRICE</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(score?.ppm_m1_price)}</p>
                </div></div>
                <div className={`px-3 py-1 ${cb}`}>
                  {!m2na && <div className={stepBox}>
                    <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[4]</span> ESTIMATED FUTURE PRICE</p>
                    <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(score?.ppm_m2_price)}</p>
                  </div>}
                </div>
                <div className="px-3 py-1">
                  {!m3na && <div className={stepBox}>
                    <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[4]</span> ESTIMATED FUTURE PRICE</p>
                    <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(score?.ppm_m3_price)}</p>
                  </div>}
                </div>

                {/* ── ROW 5.5: Dividend annotation ── */}
                <div className={`px-3 py-0.5 text-center ${cb}`}>
                  <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>{divLabel}</p>
                </div>
                <div className={`px-3 py-0.5 text-center ${cb}`}>
                  {!m2na && <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>{divLabel}</p>}
                </div>
                <div className="px-3 py-0.5 text-center">
                  {!m3na && <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>{divLabel}</p>}
                </div>

                {/* ── ROW 5.6: Arrow ── */}
                <div className={cb}>{arrow("0.25")}</div>
                <div className={cb}>{!m2na && arrow("0.25")}</div>
                <div>{!m3na && arrow("0.25")}</div>

                {/* ── ROW 6: Step [5] — Total Return Price ── */}
                <div className={`px-3 pt-1 pb-2 ${cb}`}>
                  <div className="rounded p-2 text-center" style={{ background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.55)" }}>
                    <p className="text-[8px] tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.4)" }}><span className="font-bold">[5]</span> TOTAL RETURN PRICE</p>
                    <p className="text-lg font-bold font-mono" style={{ color: "#00ff41" }}>{fmtDollar(score?.ppm_m1_price != null ? Number(score.ppm_m1_price) + cumDivPs : null)}</p>
                  </div>
                </div>
                <div className={`px-3 pt-1 pb-2 ${cb}`}>
                  {!m2na && <div className="rounded p-2 text-center" style={{ background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.55)" }}>
                    <p className="text-[8px] tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.4)" }}><span className="font-bold">[5]</span> TOTAL RETURN PRICE</p>
                    <p className="text-lg font-bold font-mono" style={{ color: "#00ff41" }}>{fmtDollar(score?.ppm_m2_price != null ? Number(score.ppm_m2_price) + cumDivPs : null)}</p>
                  </div>}
                </div>
                <div className="px-3 pt-1 pb-2">
                  {!m3na && <div className="rounded p-2 text-center" style={{ background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.55)" }}>
                    <p className="text-[8px] tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.4)" }}><span className="font-bold">[5]</span> TOTAL RETURN PRICE</p>
                    <p className="text-lg font-bold font-mono" style={{ color: "#00ff41" }}>{fmtDollar(score?.ppm_m3_price != null ? Number(score.ppm_m3_price) + cumDivPs : null)}</p>
                  </div>}
                </div>

              </div>
            );
          })()}

          {/* Blended projection */}
          <div className="px-5 py-6 text-center" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
            <p className="text-[9px] font-bold tracking-[0.3em] mb-2" style={{ color: "rgba(0,255,65,0.3)" }}>AVERAGE OF ALL METHODS</p>
            <p className="text-4xl font-bold font-mono" style={{ color: "#00ff41" }}>{fmtDollar(blendedPrice)}</p>
            <p className="text-[9px] tracking-widest mt-1.5" style={{ color: "rgba(0,255,65,0.3)" }}>Blending M1 + M2 (+ M3 if applicable) — averaged to one target price</p>
          </div>

          {/* Return summary — reuse top price projection card layout */}
          <div className="flex items-center gap-4 px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
            <div className="flex-1 text-center">
              <p className="text-xs tracking-widest mb-1" style={{ color: "rgba(0,255,65,0.4)" }}>CURRENT PRICE</p>
              <p className="text-2xl font-bold font-mono" style={{ color: "#00ff41" }}>
                {fmtDollar(currentPrice)}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center shrink-0 gap-0.5">
              <p className="text-[9px] font-bold tracking-[0.2em]" style={{ color: "rgba(0,255,65,0.5)" }}>
                {score?.ppm_cagr != null ? `CAGR (5Y) ${fmtCagr(score.ppm_cagr)}` : ""}
              </p>
              <p className="text-2xl font-mono" style={{ color: "rgba(0,255,65,0.3)" }}>→</p>
              <p className="text-[9px] font-bold tracking-[0.2em]" style={{ color: "rgba(0,255,65,0.5)" }}>
                {currentPrice && blendedPrice ? `${(blendedPrice / currentPrice).toFixed(1)}x` : ""}
              </p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-xs tracking-widest mb-1" style={{ color: "rgba(0,255,65,0.4)" }}>PROJECTED (5Y)</p>
              <p className="text-2xl font-bold font-mono" style={{ color: "#00ff41" }}>
                {fmtDollar(blendedPrice)}
              </p>
            </div>
          </div>

          {/* S&P 500 benchmark comparison */}
          {(() => {
            const ppmCagrNum  = score?.ppm_cagr   != null ? Number(score.ppm_cagr)        : null;
            const sp500CagrNum = scoreEx?.sp500_cagr != null ? Number(scoreEx.sp500_cagr) : null;
            if (ppmCagrNum == null || sp500CagrNum == null) return null;
            const ppmMult   = Math.pow(1 + ppmCagrNum,   5);
            const sp500Mult = Math.pow(1 + sp500CagrNum, 5);
            const diff = ppmCagrNum - sp500CagrNum;
            const [compText, compColor] =
              diff > 0.01
                ? [`Beats S&P by +${(diff * 100).toFixed(1)}% per year`, "#00ff41"]
                : diff < -0.01
                  ? [`Trails S&P by ${(Math.abs(diff) * 100).toFixed(1)}% per year`, "#ef4444"]
                  : ["Roughly matches S&P 500", "#f59e0b"];
            const isClose     = Math.abs(diff) <= 0.01;
            const tickerWins  = diff > 0.01;
            const tickerColor = isClose ? "#f59e0b" : tickerWins ? "#00ff41" : "#ef4444";
            const sp500Color  = isClose ? "#f59e0b" : tickerWins ? "#ef4444" : "#00ff41";
            return (
              <div className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-center">
                    <p className="text-[10px] tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>{ticker} RETURN</p>
                    <p className="text-base font-bold font-mono" style={{ color: tickerColor }}>
                      {fmtCagr(score?.ppm_cagr)}
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
                      {fmtCagr(scoreEx?.sp500_cagr)}
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
            );
          })()}

          {/* Projected Return score box */}
          {(() => {
            if (score?.ppm_score == null || score?.ppm_cagr == null || scoreEx?.sp500_cagr == null) return null;
            const ppmScore    = Number(score.ppm_score);
            const ppmCagr     = Number(score.ppm_cagr);
            const sp500Cagr   = Number(scoreEx.sp500_cagr);
            const ppmCagrPct  = (ppmCagr * 100).toFixed(1);
            const sp500CagrPct = (sp500Cagr * 100).toFixed(1);
            const ratio       = sp500Cagr !== 0 ? (ppmCagr / sp500Cagr).toFixed(2) : "—";
            // Needle: piecewise linear mapping to zones SELL=50% HOLD=10% BUY=40%
            // Zone boundaries: SELL[-S&P → S&P] HOLD[S&P → 1.2×] BUY[1.2×→]
            const needlePos = (() => {
              if (ppmCagr < sp500Cagr)
                return Math.max(0, (ppmCagr + sp500Cagr) / (2 * sp500Cagr) * 0.50);
              if (ppmCagr < 1.2 * sp500Cagr)
                return 0.50 + (ppmCagr - sp500Cagr) / (0.2 * sp500Cagr) * 0.10;
              return Math.min(1.0, 0.60 + (ppmCagr - 1.2 * sp500Cagr) / (0.3 * sp500Cagr) * 0.40);
            })();
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
                {/* Benchmark bar: SELL=50% HOLD=10% BUY=40%
                    Range: [-S&P, BUY+] — needle is piecewise linear, zone-accurate */}
                {(() => {
                  const markerColor =
                    ppmCagr < sp500Cagr         ? "#ef4444"
                    : ppmCagr < 1.2 * sp500Cagr ? "#f59e0b"
                    : ppmCagr < 1.5 * sp500Cagr ? "#a3e635"
                    : "#00ff41";
                  const ticks = [
                    { left: "0%",   cagr: "−S&P", zone: "SELL", zoneColor: "rgba(239,68,68,0.6)"   },
                    { left: "30%",  cagr: "0",    zone: "",      zoneColor: "rgba(239,68,68,0.4)"   },
                    { left: "50%",  cagr: "S&P",  zone: "HOLD", zoneColor: "rgba(245,158,11,0.65)" },
                    { left: "60%",  cagr: "1.2×", zone: "BUY",  zoneColor: "rgba(163,230,53,0.65)" },
                    { left: "100%", cagr: "1.5×", zone: "BUY+", zoneColor: "rgba(0,255,65,0.7)"   },
                  ] as const;
                  return (
                    <div className="mt-3">
                      {/* Needle (value + ▼) pinned above bar */}
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
                      {/* 4-zone bar */}
                      <div className="flex w-full h-2 rounded-full overflow-hidden">
                        <div style={{ width: "30%", background: "rgba(220,38,38,0.8)"   }} />
                        <div style={{ width: "20%", background: "rgba(180,40,40,0.4)"   }} />
                        <div style={{ width: "10%", background: "rgba(245,158,11,0.55)" }} />
                        <div style={{ width: "40%", background: "rgba(163,230,53,0.45)" }} />
                      </div>
                      {/* Tick marks and zone labels */}
                      <div className="relative" style={{ height: 48 }}>
                        {/* Tick nubs */}
                        {(["0%", "30%", "50%", "60%", "100%"] as const).map(left => (
                          <div key={left} className="absolute" style={{ left, top: 0, width: 1, height: 8, background: "rgba(255,255,255,0.4)", transform: "translateX(-50%)" }} />
                        ))}
                        {/* Tick labels */}
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
                        {/* Zone labels */}
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
                  );
                })()}
              </div>
            );
          })()}

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
          )}>
          {/* Bar charts — 5-year actuals */}
          {(() => {
            type FundRow = { fiscal_year: number; revenue: number | null; ebitda: number | null; free_cash_flow: number | null };
            type MetricKey = "revenue" | "ebitda" | "free_cash_flow";
            const rows = fundamentals as FundRow[];
            if (!rows.length) return null;
            const CHART_H = 80;


            const SIG_COLOR: Record<string, string> = {
              "Solid Growth": "#00ff41", "Slowing Growth": "#00ff41",
              "Decelerating": "#f59e0b", "Deteriorating": "#f59e0b", "Freefall": "#ef4444",
            };
            const sp500Cagr = scoreEx?.sp500_cagr != null ? Number(scoreEx.sp500_cagr) : null;
            const FCF_TREND: Record<string, { arrow: string; label: string }> = {
              "Solid Growth":   { arrow: "↑", label: "Growing" },
              "Slowing Growth": { arrow: "↑", label: "Growing" },
              "Decelerating":   { arrow: "→", label: "Slowing" },
              "Deteriorating":  { arrow: "↓", label: "Declining" },
              "Freefall":       { arrow: "↓", label: "Declining" },
            };

            const metrics: { key: MetricKey; label: string; cagr: number | null | undefined; signal: string | null | undefined }[] = [
              { key: "revenue",        label: "REVENUE",        cagr: score?.revenue_cagr_5y,  signal: scoreEx?.gq_signal_revenue },
              { key: "ebitda",         label: "EBITDA",         cagr: score?.net_income_cagr_5y != null ? Number(score.net_income_cagr_5y) : null, signal: scoreEx?.gq_signal_net_income },
              { key: "free_cash_flow", label: "FREE CASH FLOW", cagr: score?.fcf_cagr_5y,      signal: scoreEx?.gq_signal_fcf },
            ];

            return (
              <>
              <div className="px-5 pb-5" style={{ borderTop: "1px solid rgba(0,255,65,0.1)" }}>
                <div className="pt-4 pb-2 mb-3" style={{ borderBottom: "1px solid rgba(0,255,65,0.3)" }}>
                  <p className="text-base font-bold leading-tight" style={{ color: "#00ff41" }}>HISTORICAL GROWTH TREND</p>
                  <p className="text-xs tracking-widest mt-0.5" style={{ color: "rgba(0,255,65,0.4)" }}>REVENUE · EBITDA · FREE CASH FLOW</p>
                </div>
                <div className="space-y-6">
                  {metrics.map(({ key, label, cagr, signal }) => {
                    const vals = rows.map(r => {
                      const v = r[key];
                      return { year: r.fiscal_year, v, isNeg: v != null && v < 0 };
                    });
                    const nonNull = vals.filter(x => x.v != null).map(x => x.v as number);
                    if (!nonNull.length) return null;
                    const baseV0  = vals[0]?.v;
                    const sp500Y5 = sp500Cagr != null && baseV0 != null && baseV0 > 0
                      ? baseV0 * Math.pow(1 + sp500Cagr, nonNull.length - 1)
                      : 0;
                    const greenY5 = cagr != null && baseV0 != null && baseV0 > 0
                      ? baseV0 * Math.pow(1 + Number(cagr), nonNull.length - 1)
                      : 0;
                    const maxPos     = Math.max(0, ...nonNull, sp500Y5, greenY5);
                    const maxNeg     = Math.min(0, ...nonNull);
                    const totalRange = maxPos - maxNeg || 1;
                    const negH       = Math.abs(maxNeg) / totalRange * CHART_H;
                    const zeroY      = maxPos            / totalRange * CHART_H;
                    const cagrNum    = cagr != null ? Number(cagr) : null;
                    const benchLabel = cagrNum == null || sp500Cagr == null ? null
                      : cagrNum < 0              ? "Declining vs S&P 500"
                      : cagrNum >= sp500Cagr * 1.5 ? "Exceptional vs S&P 500"
                      : cagrNum >= sp500Cagr * 1.2 ? "Strong vs S&P 500"
                      : cagrNum >= sp500Cagr       ? "Solid vs S&P 500"
                      : "Moderate vs S&P 500";
                    const benchColor = benchLabel?.startsWith("Exceptional") || benchLabel?.startsWith("Strong") || benchLabel?.startsWith("Solid")
                      ? "#00ff41"
                      : benchLabel?.startsWith("Moderate") ? "#f59e0b"
                      : "#ef4444";
                    return (
                      <div key={key}>
                        {/* Header: name left · signal right */}
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
                        {/* Avg. Growth + S&P badges */}
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
                            {sp500Cagr != null && (
                              <span
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                                style={{
                                  background: "rgba(255,0,0,0.15)",
                                  border: "1px solid #ff0000",
                                  color: "#ff0000",
                                }}
                              >
                                S&P {sp500Cagr >= 0 ? "+" : ""}{(sp500Cagr * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        )}
                        {/* Bar area */}
                        {(() => {
                          const nBars  = vals.length;
                          const toSvgY = (v: number) =>
                            Math.max(0, Math.min(CHART_H, zeroY - v / totalRange * CHART_H));

                          const baseV = vals[0]?.v;

                          // Compound green trend line from Y1 at weighted CAGR
                          type GreenPt = { x: number; y: number };
                          let greenPoints: GreenPt[] | null = null;
                          if (cagrNum != null && baseV != null && baseV > 0) {
                            greenPoints = vals.map((_, i) => ({
                              x: (i + 0.5) / nBars * 100,
                              y: toSvgY(baseV * Math.pow(1 + cagrNum, i)),
                            }));
                          }

                          // S&P reference line: compound from Y1 actual at sp500_cagr
                          // baseV = vals[0].v = oldest fiscal year's actual value
                          // (fundamentals queried ORDER BY fiscal_year ASC, so index 0 = leftmost bar)
                          type SpPt = { x: number; y: number };
                          let spPoints: SpPt[] | null = null;
                          if (sp500Cagr != null && baseV != null && baseV > 0) {
                            spPoints = vals.map((_, i) => ({
                              x: (i + 0.5) / nBars * 100,
                              y: toSvgY(baseV * Math.pow(1 + sp500Cagr, i)),
                            }));
                          }
                          return (
                            <div className="relative" style={{ height: CHART_H }}>
                              {maxNeg < 0 && (
                                <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: zeroY, height: 1, background: "rgba(0,255,65,0.2)" }} />
                              )}
                              <div className="absolute inset-0 flex gap-1.5">
                                {vals.map(({ year, v, isNeg }) => {
                                  const barH = v != null ? Math.max(2, Math.round(Math.abs(v) / totalRange * CHART_H)) : 0;
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
                                  );
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
                          );
                        })()}
                        {/* Value + year labels */}
                        <div className="flex gap-1.5 mt-1.5">
                          {vals.map(({ year, v, isNeg }, i) => {
                            const prevV      = i > 0 ? vals[i - 1].v : null;
                            const absChange  = v != null && prevV != null ? v - prevV : null;
                            const pctChange  = absChange != null && prevV != null && prevV !== 0
                              ? (absChange / Math.abs(prevV)) * 100
                              : null;
                            const changeColor = absChange == null
                              ? "rgba(0,255,65,0.3)"
                              : absChange > 0 ? "#00ff41"
                              : absChange < 0 ? "#ef4444"
                              : "rgba(0,255,65,0.3)";
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
                                          const sign = absChange >= 0 ? "+" : "-";
                                          const abs  = Math.abs(absChange);
                                          const bn   = abs / 1_000_000_000;
                                          const mn   = abs / 1_000_000;
                                          if (bn >= 1) return `${sign}$${bn.toFixed(1)}B`;
                                          if (mn >= 1) return `${sign}$${mn.toFixed(1)}M`;
                                          return `${sign}$${abs.toFixed(0)}`;
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
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Growth Quality score section */}
              {(() => {
                if (score?.growth_score == null) return null;
                const growthScore = Number(score.growth_score);
                const sp500Base   = scoreEx?.sp500_cagr != null ? Math.max(Number(scoreEx.sp500_cagr), 0.01) : 0.10;
                const cagrToScore = (cagr: number | null | undefined): number => {
                  if (cagr == null) return 50;
                  const cap = sp500Base * 2, mid = sp500Base, floor = -sp500Base;
                  if (cagr >= cap) return 100;
                  if (cagr >= mid) return 50 + (cagr - mid) / (cap - mid) * 50;
                  if (cagr >= 0)   return 35 + (cagr / mid) * 15;
                  if (cagr >= floor) return Math.max(0, (cagr - floor) / (-floor) * 35);
                  return 0;
                };
                const revCagr = score?.revenue_cagr_5y    != null ? Number(score.revenue_cagr_5y)    : null;
                const niCagr  = score?.net_income_cagr_5y != null ? Number(score.net_income_cagr_5y) : null;
                const fcfCagr = score?.fcf_cagr_5y        != null ? Number(score.fcf_cagr_5y)        : null;
                const revSig  = scoreEx?.gq_signal_revenue    ?? null;
                const niSig   = scoreEx?.gq_signal_net_income ?? null;
                const fcfSig  = scoreEx?.gq_signal_fcf        ?? null;
                const revPts  = Math.round(cagrToScore(revCagr));
                const niPts   = Math.round(cagrToScore(niCagr));
                const fcfPts  = fcfCagr != null ? Math.round(cagrToScore(fcfCagr)) : null;
                const TREND_MULT: Record<string, number> = {
                  "Solid Growth": 1.00, "Slowing Growth": 0.90,
                  "Decelerating": 0.75, "Deteriorating": 0.50, "Freefall": 0.25,
                };
                const allSigs    = [revSig, niSig, fcfSig].filter(Boolean) as string[];
                const worstMult  = allSigs.length ? Math.min(...allSigs.map(s => TREND_MULT[s] ?? 1.0)) : 1.0;
                const worstSig   = allSigs.find(s => (TREND_MULT[s] ?? 1.0) === worstMult) ?? null;
                const hasPenalty = worstMult <= 0.75;
                const toNeedlePos = (s: number): number => {
                  if (s <= 0)  return 0;
                  if (s <= 40) return s / 40 * 0.50;
                  if (s <= 48) return 0.50 + (s - 40) / 8 * 0.10;
                  return Math.min(1.0, 0.60 + (s - 48) / 52 * 0.40);
                };
                const toMarkerColor = (s: number) =>
                  s < 40 ? "#ef4444" : s < 48 ? "#f59e0b" : s < 60 ? "#a3e635" : "#00ff41";
                const SCORE_TICKS = [
                  { left: "0%",   label: "-S&P", zone: "SELL", zoneColor: "rgba(239,68,68,0.6)"   },
                  { left: "30%",  label: "0",    zone: "",      zoneColor: "rgba(239,68,68,0.4)"   },
                  { left: "50%",  label: "S&P",  zone: "HOLD", zoneColor: "rgba(245,158,11,0.65)" },
                  { left: "60%",  label: "1.2×", zone: "BUY",  zoneColor: "rgba(163,230,53,0.65)" },
                  { left: "100%", label: "1.5×", zone: "BUY+", zoneColor: "rgba(0,255,65,0.7)"    },
                ] as const;
                const miniRows = [
                  { name: "REVENUE", sig: revSig, pts: revPts, cagr: revCagr },
                  { name: "EBITDA",  sig: niSig,  pts: niPts,  cagr: niCagr  },
                  { name: "FCF",     sig: fcfSig, pts: fcfPts, cagr: fcfCagr },
                ];
                const validPts     = miniRows.map(r => r.pts).filter((p): p is number => p != null);
                const rawScore     = validPts.length ? Math.round(validPts.reduce((s, p) => s + p, 0) / validPts.length) : null;
                const penaltyLabel = hasPenalty && worstSig ? `${worstSig} ×${worstMult.toFixed(2)}` : "None";
                return (
                  <div className="mx-2 mt-4 mb-4 rounded p-3" style={{ border: "1px solid rgba(0,255,65,0.15)" }}>
                    <div className="mb-3 pb-2" style={{ borderBottom: "1px solid rgba(0,255,65,0.08)" }}>
                      <p className="text-[10px] uppercase tracking-widest text-center" style={{ color: "rgba(0,255,65,0.4)" }}>
                        GROWTH QUALITY SCORE
                      </p>
                      <p className="text-3xl font-bold font-mono text-center mt-1" style={{ color: scoreColor(growthScore) }}>
                        {growthScore.toFixed(1)}%
                      </p>
                    </div>
                    <p className="text-[10px] font-mono text-center mb-2" style={{ color: "rgba(0,255,65,0.8)" }}>
                      Scored on Avg. Growth Rate vs S&P 500
                    </p>
                    <div className="space-y-0">
                      {miniRows.map(({ name, sig, pts, cagr }, rowIdx) => {
                        const ptsNum = pts ?? 0;
                        const needle = toNeedlePos(ptsNum);
                        const mc     = pts != null ? toMarkerColor(ptsNum) : "rgba(0,255,65,0.3)";
                        const formulaLabel = cagr != null && sp500Base > 0
                          ? `${ticker} ${(cagr * 100).toFixed(1)}% ÷ S&P ${(sp500Base * 100).toFixed(1)}% = ${(cagr / sp500Base).toFixed(2)}×`
                          : sig && FCF_TREND[sig] ? `${FCF_TREND[sig].arrow} ${FCF_TREND[sig].label}` : "—";
                        return (
                          <div key={name}>
                            {/* Needle — offset by 68px (60px name + 8px gap) to align with bar column */}
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
                            {/* Name + bar in a flex row — name aligns with bar stripe */}
                            <div className={rowIdx === miniRows.length - 1 ? "flex items-start gap-2" : "flex items-center gap-2"}>
                              <p className="text-[10px] font-mono font-bold shrink-0" title={formulaLabel} style={{ width: 60, color: "#00ff41", cursor: "help" }}>{name}</p>
                              <div className="flex-1 min-w-0">
                                {/* 4-zone bar */}
                                <div className="flex w-full h-2 rounded-full overflow-hidden">
                                  <div style={{ width: "30%", background: "rgba(220,38,38,0.8)"   }} />
                                  <div style={{ width: "20%", background: "rgba(180,40,40,0.4)"   }} />
                                  <div style={{ width: "10%", background: "rgba(245,158,11,0.55)" }} />
                                  <div style={{ width: "40%", background: "rgba(163,230,53,0.45)" }} />
                                </div>
                                {/* Tick marks and zone labels */}
                                <div className="relative" style={{ height: rowIdx === miniRows.length - 1 ? 48 : 8 }}>
                                  {/* Tick nubs */}
                                  {(["0%", "30%", "50%", "60%", "100%"] as const).map(left => (
                                    <div key={left} className="absolute" style={{ left, top: 0, width: 1, height: 8, background: "rgba(255,255,255,0.4)", transform: "translateX(-50%)" }} />
                                  ))}
                                  {/* Tick labels (last row only) */}
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
                        );
                      })}
                    </div>
                    {rawScore != null && (
                      <div className="mt-3 font-mono">
                        <p style={{ fontSize: 9, color: "rgba(0,255,65,0.8)" }}>Score Breakdown:</p>
                        <p style={{ fontSize: 10, color: "#00ff41" }}>
                          ({revPts}% + {niPts}% + {fcfPts != null ? `${fcfPts}%` : "N/A"}) ÷ 3 × {worstMult.toFixed(2)} = {growthScore.toFixed(1)}%
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
                            <span style={{ color: scoreColor(growthScore) }}>: {growthScore.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              </>
            );
          })()}
        </CollapsibleLayer>

          {/* Layer 3: Health */}
          <CollapsibleLayer id={4} header={(
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>
              LAYER 3 — FINANCIAL HEALTH
            </p>
          )}>
          <div className="px-5 pt-4 pb-3">
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
          )}>
          <div className="px-5 py-6 space-y-3">
            {/* ROW 1–3 — Column: bordered label box → weight → score */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "PROJECTED RETURN", sub: "(5Y)", weight: "WEIGHT: 40%", value: score?.ppm_score },
                { label: "GROWTH QUALITY",   sub: null,   weight: "WEIGHT: 30%", value: score?.growth_score },
                { label: "FINANCIAL HEALTH", sub: null,   weight: "WEIGHT: 30%", value: score?.health_score },
              ].map(({ label, sub, weight, value }, idx) => {
                const c = healthColor(value != null ? Number(value) : null);
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
                        ? `${score?.ppm_cagr != null ? `${(Number(score.ppm_cagr) * 100).toFixed(1)}% CAGR (5Y)` : "—"} vs S&P ${scoreEx?.sp500_cagr != null ? `${(Number(scoreEx.sp500_cagr) * 100).toFixed(1)}%` : "—"} benchmark`
                        : idx === 1
                        ? "Revenue, EBITDA & FCF growth, adjusted for trend quality"
                        : `${score?.health_passes ?? 0} of ${scoredTotal} Buffett checks passed`}
                    </p>
                  </div>
                );
              })}
            </div>
            {/* ROW 4 — Converging line + center arrow */}
            <div className="relative" style={{ height: 28 }}>
              <div className="absolute inset-x-0" style={{ top: 10, height: 1, background: "rgba(0,255,65,0.15)" }} />
              <div className="absolute inset-x-0 text-center" style={{ top: 10 }}>
                <span className="text-sm" style={{ color: "rgba(0,255,65,0.3)" }}>↓</span>
              </div>
            </div>
            {/* ROW 5 — Final score + signal */}
            <div className="text-center space-y-3 pb-2">
              <p className="text-[10px] tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>FINAL SCORE</p>
              <p className="text-4xl font-bold font-mono" style={{ color: scoreColor(score?.final_score) }}>
                {score?.final_score != null ? `${Number(score.final_score).toFixed(1)}%` : "—"}
              </p>
              {(() => {
                const s = (score?.signal ?? "").toUpperCase();
                const styles: Record<string, React.CSSProperties> = {
                  "BUY+": { background: "rgba(0,255,65,0.25)",  color: "#00ff41", border: "1px solid rgba(0,255,65,0.9)" },
                  BUY:    { background: "rgba(0,255,65,0.15)",  color: "#00ff41", border: "1px solid rgba(0,255,65,0.6)" },
                  HOLD:   { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.5)" },
                  SELL:   { background: "rgba(239,68,68,0.15)",  color: "#ef4444", border: "1px solid rgba(239,68,68,0.5)" },
                };
                return (
                  <div className="flex justify-center">
                    <span
                      className="inline-block text-lg font-bold tracking-widest px-6 py-2 rounded"
                      style={styles[s] ?? { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      {s || "—"}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </CollapsibleLayer>

        </LayerProvider>
      </div>
    </div>
  );
}
