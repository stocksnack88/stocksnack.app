import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";
import UpgradeButton from "@/components/ui/UpgradeButton";
import DescriptionToggle from "@/components/ui/DescriptionToggle";
import HealthCategories from "@/components/ui/HealthCategories";
import SegmentBreakdown from "@/components/ui/SegmentBreakdown";

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
  return v >= 70 ? "#00ff41" : v >= 45 ? "#fbbf24" : "#f87171";
}

function healthColor(v: number | null | undefined): string {
  if (v == null) return "#666";
  return v >= 75 ? "#00ff41" : v >= 50 ? "#f59e0b" : "#ef4444";
}


function SignalBadge({ signal }: { signal: string | null | undefined }) {
  const s = (signal ?? "").toUpperCase();
  const map: Record<string, React.CSSProperties> = {
    BUY: { background: "rgba(0,255,65,0.15)", color: "#00ff41", border: "1px solid rgba(0,255,65,0.6)" },
    HOLD: { background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.5)" },
    SELL: { background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.5)" },
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
const card = { border: "1px solid rgba(0,255,65,0.2)", background: "rgba(0,255,65,0.02)" };

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

  // Top FREE_LIMIT tickers by score → accessible to free users
  const { data: topRows } = await supabaseAdmin
    .from("stock_scores")
    .select("ticker")
    .order("final_score", { ascending: false })
    .limit(FREE_LIMIT);
  const freeTickers = new Set((topRows ?? []).map((r: { ticker: string }) => r.ticker));

  let isPro = false;
  if (session?.user?.id) {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("subscription_status")
      .eq("id", session.user.id)
      .single();
    isPro =
      profile?.subscription_status === "active" ||
      profile?.subscription_status === "trialing";
  }

  const [stockRes, priceRes, scoreRes, fundRes] = await Promise.all([
    supabaseAdmin.from("stocks").select("*").eq("ticker", ticker).single(),
    supabaseAdmin.from("stock_prices").select("*").eq("ticker", ticker).single(),
    supabaseAdmin.from("stock_scores").select("*").eq("ticker", ticker).single(),
    supabaseAdmin.from("stock_fundamentals")
      .select("fiscal_year,revenue,ebitda,free_cash_flow")
      .eq("ticker", ticker)
      .order("fiscal_year", { ascending: true })
      .limit(5),
  ]);

  if (stockRes.error && scoreRes.error) return notFound();

  const stock = stockRes.data;
  const price = priceRes.data;
  const score = scoreRes.data;
  const fundamentals = fundRes.data ?? [];
  const canAccess = isPro || freeTickers.has(ticker);

  // ── Paywall ──────────────────────────────────────────────────────────────────
  if (!canAccess) {
    return (
      <div className="bg-black" style={mono}>
        <div className="border-b px-6 py-3" style={{ borderColor: "rgba(0,255,65,0.1)" }}>
          <Link href="/screener" className="text-xs tracking-widest transition-colors"
            style={{ color: "rgba(0,255,65,0.5)" }}>
            ← SCREENER
          </Link>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <p className="text-5xl mb-6" style={{ color: "rgba(0,255,65,0.15)" }}>⊘</p>
          <h2 className="text-sm font-bold tracking-widest mb-2" style={{ color: "#00ff41" }}>
            PRO STOCK
          </h2>
          <p className="text-xs mb-1" style={{ color: "rgba(0,255,65,0.5)" }}>
            {ticker}{stock?.name ? ` · ${stock.name}` : ""}
          </p>
          <p className="text-xs max-w-xs leading-relaxed mb-8" style={{ color: "rgba(0,255,65,0.35)" }}>
            Full scoring detail for this stock is available to Pro subscribers.
            Upgrade to unlock all 20 stocks with complete breakdowns.
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
  };
  const scoreEx = score as (NonNullable<typeof score> & ScoreExtras) | null;

  return (
    <div className="bg-black" style={mono}>
      {/* Breadcrumb */}
      <div className="border-b px-6 py-3" style={{ borderColor: "rgba(0,255,65,0.1)" }}>
        <Link
          href="/screener"
          className="text-xs tracking-widest transition-colors"
          style={{ color: "rgba(0,255,65,0.5)" }}
        >
          ← SCREENER
        </Link>
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
            </div>
            <p className="text-sm mb-1" style={{ color: "rgba(0,255,65,0.7)" }}>
              {stock?.name ?? "—"}
            </p>
            <p className="text-xs tracking-wide" style={{ color: "rgba(0,255,65,0.4)" }}>
              {[stock?.sector, stock?.industry, stock?.exchange].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        {/* Price projection */}
        <div className="rounded overflow-hidden" style={card}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)", background: "#001a00" }}>
            <p className="text-[11px] font-bold tracking-widest whitespace-nowrap" style={{ color: "#00ff41" }}>{ticker} Price In 5 Years (Projected)</p>
          </div>
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="flex-1 text-center">
              <p className="text-xs tracking-widest mb-1" style={{ color: "rgba(0,255,65,0.4)" }}>CURRENT PRICE</p>
              <p className="text-2xl font-bold font-mono" style={{ color: "#00ff41" }}>
                {fmtDollar(currentPrice)}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center shrink-0 gap-0.5">
              <p className="text-[9px] font-bold tracking-[0.2em]" style={{ color: "rgba(0,255,65,0.5)" }}>
                {score?.ppm_cagr != null ? `CAGR ${fmtCagr(score.ppm_cagr)}` : ""}
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

        {/* ── Scorecard ───────────────────────────────────────────────────────── */}
        <div className="rounded overflow-hidden" style={card}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)", background: "#001a00" }}>
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>WHAT YOU ARE BUYING</p>
          </div>
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
                label: "CAGR VS S&P 500",
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
        </div>

        {/* ── About the Business ──────────────────────────────────────────────── */}
        {(() => {
          const rawProduct = scoreEx != null ? scoreEx.product_segments : undefined;
          const rawGeo     = scoreEx != null ? scoreEx.geo_segments     : undefined;
          const productSegs: Segment[] = Array.isArray(rawProduct) ? rawProduct : [];
          const geoSegs: Segment[]     = Array.isArray(rawGeo)     ? rawGeo     : [];
          if (!stock?.description && !productSegs.length && !geoSegs.length) return null;
          return (
            <section className="rounded overflow-hidden" style={card}>
              <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)", background: "#001a00" }}>
                <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>ABOUT THE BUSINESS</p>
              </div>

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
            </section>
          );
        })()}

        {/* ── Layer 1: PPM ─────────────────────────────────────────────────────── */}
        <section className="rounded overflow-hidden" style={card}>
          {/* Header */}
          <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)", background: "#001a00" }}>
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>
              LAYER 1 — HOW WE PROJECT THE PRICE
            </p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(0,255,65,0.4)" }}>
              3 independent methods blended into a single 5-year price target
            </p>
          </div>

          {/* Compact summary row */}
          <p className="text-center text-[9px] font-mono tracking-widest py-2.5" style={{ color: "rgba(0,255,65,0.45)", borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
            {score?.ppm_cagr != null ? `~${(Number(score.ppm_cagr) * 100).toFixed(1)}% PER YEAR` : "—"}
            {" · "}
            {currentPrice && blendedPrice ? `~${(blendedPrice / currentPrice).toFixed(1)}x RETURN` : "—"}
          </p>

          {/* 3 method cards */}
          {(() => {
            const m3na = scoreEx?.m3_applicable === false || !score?.ppm_m3_price || Number(score.ppm_m3_price) === 0;
            const m2na = !score?.ppm_m2_price || Number(score.ppm_m2_price) === 0;
            const stepBox = "border border-[rgba(0,255,65,0.1)] rounded p-1 text-center";
            const colBorder = "border-r border-[rgba(0,255,65,0.1)]";
            const cumDivPs = scoreEx?.m_cumulative_div_ps != null ? Number(scoreEx.m_cumulative_div_ps) : 0;
            const divLabel = `+ $${cumDivPs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} dividends received over 5Y`;
            const arrow = (op: string) => (
              <div className="text-center text-[9px] leading-none py-0" style={{ color: `rgba(0,255,65,${op})` }}>↓</div>
            );
            return (
              <div className="grid grid-cols-3" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>

                {/* M1 — always active */}
                <div className={colBorder}>
                  <div className="px-3 pt-2 pb-1 text-center">
                    <p className="text-xs tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.2)" }}>METHOD 1</p>
                    <p className="text-xs font-bold tracking-wider" style={{ color: "#00ff41" }}>EARNINGS GROWTH</p>
                  </div>
                  <div className="px-3 py-1"><div className={stepBox}>
                    <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[1]</span> CURRENT PRICE</p>
                    <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(currentPrice)}</p>
                  </div></div>
                  {arrow("0.25")}
                  <div className="px-3 py-1"><div className={stepBox}>
                    <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[2]</span> CURRENT EBITDA</p>
                    <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtBn(scoreEx?.m1_ebitda_current)}</p>
                  </div></div>
                  {arrow("0.4")}
                  <div className="px-3 py-0.5 text-center">
                    <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                      Growing at {scoreEx?.m1_growth_rate != null ? `${(Number(scoreEx.m1_growth_rate) * 100).toFixed(1)}%` : "—"}
                    </p>
                  </div>
                  {arrow("0.25")}
                  <div className="px-3 py-1"><div className={stepBox}>
                    <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[3]</span> PROJECT 5Y EBITDA</p>
                    <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtBn(scoreEx?.m1_ebitda_projected)}</p>
                  </div></div>
                  {arrow("0.4")}
                  <div className="px-3 py-0.5 text-center">
                    <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                      At {scoreEx?.m1_ev_ebitda_multiple != null ? `${Number(scoreEx.m1_ev_ebitda_multiple).toFixed(0)}x` : "—"} earnings multiple
                    </p>
                  </div>
                  {arrow("0.25")}
                  <div className="px-3 py-1"><div className={stepBox}>
                    <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[4]</span> ESTIMATED FUTURE PRICE</p>
                    <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(score?.ppm_m1_price)}</p>
                  </div></div>
                  {arrow("0.4")}
                  <div className="px-3 py-0.5 text-center">
                    <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>{divLabel}</p>
                  </div>
                  {arrow("0.25")}
                  <div className="px-3 pt-1 pb-2">
                    <div className="rounded p-2 text-center" style={{ background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.55)" }}>
                      <p className="text-[8px] tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.4)" }}><span className="font-bold">[5]</span> TOTAL RETURN PRICE</p>
                      <p className="text-lg font-bold font-mono" style={{ color: "#00ff41" }}>{fmtDollar(score?.ppm_m1_price != null ? Number(score.ppm_m1_price) + cumDivPs : null)}</p>
                    </div>
                  </div>
                </div>

                {/* M2 — active or N/A */}
                {m2na ? (
                  <div className={`${colBorder} opacity-40`}>
                    <div className="px-3 pt-2 pb-1 text-center">
                      <p className="text-xs tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.2)" }}>METHOD 2</p>
                      <p className="text-xs font-bold tracking-wider" style={{ color: "#00ff41" }}>FREE CASH FLOW</p>
                    </div>
                    <div className="px-3 pt-3 pb-4 text-center">
                      <p className="text-[9px] font-bold tracking-widest mb-1.5" style={{ color: "rgba(0,255,65,0.7)" }}>NOT APPLICABLE</p>
                      <p className="text-[9px] leading-relaxed" style={{ color: "rgba(0,255,65,0.5)" }}>FCF method excluded for financial sector</p>
                    </div>
                  </div>
                ) : (
                  <div className={colBorder}>
                    <div className="px-3 pt-2 pb-1 text-center">
                      <p className="text-xs tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.2)" }}>METHOD 2</p>
                      <p className="text-xs font-bold tracking-wider" style={{ color: "#00ff41" }}>FREE CASH FLOW</p>
                    </div>
                    <div className="px-3 py-1"><div className={stepBox}>
                      <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[1]</span> CURRENT PRICE</p>
                      <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(currentPrice)}</p>
                    </div></div>
                    {arrow("0.25")}
                    <div className="px-3 py-1"><div className={stepBox}>
                      <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[2]</span> CURRENT FCF</p>
                      <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtBn(scoreEx?.m2_fcf_current)}</p>
                    </div></div>
                    {arrow("0.4")}
                    <div className="px-3 py-0.5 text-center">
                      <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                        Growing at {scoreEx?.m2_growth_rate != null ? `${(Number(scoreEx.m2_growth_rate) * 100).toFixed(1)}%` : "—"}
                      </p>
                    </div>
                    {arrow("0.25")}
                    <div className="px-3 py-1"><div className={stepBox}>
                      <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[3]</span> PROJECT 5Y FCF</p>
                      <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtBn(scoreEx?.m2_fcf_projected)}</p>
                    </div></div>
                    {arrow("0.4")}
                    <div className="px-3 py-0.5 text-center">
                      <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                        At {scoreEx?.m2_fcf_yield != null ? `${(Number(scoreEx.m2_fcf_yield) * 100).toFixed(1)}%` : "—"} cash flow yield
                      </p>
                    </div>
                    {arrow("0.25")}
                    <div className="px-3 py-1"><div className={stepBox}>
                      <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[4]</span> ESTIMATED FUTURE PRICE</p>
                      <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(score?.ppm_m2_price)}</p>
                    </div></div>
                    {arrow("0.4")}
                    <div className="px-3 py-0.5 text-center">
                      <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>{divLabel}</p>
                    </div>
                    {arrow("0.25")}
                    <div className="px-3 pt-1 pb-2">
                      <div className="rounded p-2 text-center" style={{ background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.55)" }}>
                        <p className="text-[8px] tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.4)" }}><span className="font-bold">[5]</span> TOTAL RETURN PRICE</p>
                        <p className="text-lg font-bold font-mono" style={{ color: "#00ff41" }}>{fmtDollar(score?.ppm_m2_price != null ? Number(score.ppm_m2_price) + cumDivPs : null)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* M3 — active or N/A */}
                {m3na ? (
                  <div className="opacity-40">
                    <div className="px-3 pt-2 pb-1 text-center">
                      <p className="text-xs tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.2)" }}>METHOD 3</p>
                      <p className="text-xs font-bold tracking-wider" style={{ color: "#00ff41" }}>DIVIDENDS</p>
                    </div>
                    <div className="px-3 pt-3 pb-4 text-center">
                      <p className="text-[9px] font-bold tracking-widest mb-1.5" style={{ color: "rgba(0,255,65,0.7)" }}>NOT APPLICABLE</p>
                      <p className="text-[9px] leading-relaxed" style={{ color: "rgba(0,255,65,0.5)" }}>Dividend yield below 4.5% threshold</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="px-3 pt-2 pb-1 text-center">
                      <p className="text-xs tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.2)" }}>METHOD 3</p>
                      <p className="text-xs font-bold tracking-wider" style={{ color: "#00ff41" }}>DIVIDENDS</p>
                    </div>
                    <div className="px-3 py-1"><div className={stepBox}>
                      <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[1]</span> CURRENT PRICE</p>
                      <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(currentPrice)}</p>
                    </div></div>
                    {arrow("0.25")}
                    <div className="px-3 py-1"><div className={stepBox}>
                      <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[2]</span> DIVIDEND YIELD</p>
                      <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>
                        {scoreEx?.m3_div_yield != null ? `${(Number(scoreEx.m3_div_yield) * 100).toFixed(1)}%` : "—"}
                      </p>
                    </div></div>
                    {arrow("0.25")}
                    <div className="px-3 py-1"><div className={stepBox}>
                      <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[3]</span> PRICE GROWTH</p>
                      <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>
                        {scoreEx?.m3_growth_rate != null ? `${(Number(scoreEx.m3_growth_rate) * 100).toFixed(1)}%` : "—"}
                      </p>
                    </div></div>
                    {arrow("0.4")}
                    {scoreEx?.m3_div_yield != null && scoreEx?.m3_growth_rate != null && (
                      <div className="px-3 py-0.5 text-center">
                        <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                          Combined: {((Number(scoreEx.m3_div_yield) + Number(scoreEx.m3_growth_rate)) * 100).toFixed(1)}% return
                        </p>
                      </div>
                    )}
                    {arrow("0.25")}
                    <div className="px-3 py-1"><div className={stepBox}>
                      <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[4]</span> ESTIMATED FUTURE PRICE</p>
                      <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(score?.ppm_m3_price)}</p>
                    </div></div>
                    {arrow("0.4")}
                    <div className="px-3 py-0.5 text-center">
                      <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>{divLabel}</p>
                    </div>
                    {arrow("0.25")}
                    <div className="px-3 pt-1 pb-2">
                      <div className="rounded p-2 text-center" style={{ background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.55)" }}>
                        <p className="text-[8px] tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.4)" }}><span className="font-bold">[5]</span> TOTAL RETURN PRICE</p>
                        <p className="text-lg font-bold font-mono" style={{ color: "#00ff41" }}>{fmtDollar(score?.ppm_m3_price != null ? Number(score.ppm_m3_price) + cumDivPs : null)}</p>
                      </div>
                    </div>
                  </div>
                )}

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
                {score?.ppm_cagr != null ? `CAGR ${fmtCagr(score.ppm_cagr)}` : ""}
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
            const ppmCagrPct  = (ppmCagr  * 100).toFixed(1);
            const sp500Pct    = (sp500Cagr * 100).toFixed(1);
            const ratio       = sp500Cagr !== 0 ? (ppmCagr / sp500Cagr).toFixed(2) : "—";
            // Marker position: maps [−sp500, 2×sp500] → [0, 1] (total range = 3×sp500)
            const markerPos   = Math.min(1, Math.max(0, (ppmCagr + sp500Cagr) / (3 * sp500Cagr)));
            return (
              <div className="mx-2 mt-4 mb-4 rounded p-3" style={{ border: "1px solid rgba(0,255,65,0.15)" }}>
                <p className="text-[10px] uppercase tracking-widest text-center mb-2" style={{ color: "rgba(0,255,65,0.4)" }}>
                  PROJECTED RETURN SCORE
                </p>
                <p className="text-3xl font-bold font-mono text-center" style={{ color: scoreColor(ppmScore) }}>
                  {ppmScore.toFixed(1)}%
                </p>
                {/* FIX 1 — ratio line */}
                <p className="text-[11px] italic text-center mt-2" style={{ color: "rgba(0,255,65,0.5)" }}>
                  {ticker} {ppmCagrPct}% ÷ S&P {sp500Pct}% = {ratio}×
                </p>
                {/* FIX 2 — benchmark bar */}
                <div className="mt-2 relative">
                  {/* Marker label above bar */}
                  <div className="relative h-3 mb-0.5">
                    <span
                      className="absolute text-[9px] font-mono -translate-x-1/2"
                      style={{ left: `${markerPos * 100}%`, color: "#fff", bottom: 0 }}
                    >
                      {ppmCagrPct}%
                    </span>
                  </div>
                  {/* 3-zone bar */}
                  <div className="flex w-full h-2 rounded-full overflow-hidden">
                    <div style={{ width: "25%", background: "rgba(239,68,68,0.4)" }} />
                    <div style={{ width: "25%", background: "rgba(245,158,11,0.4)" }} />
                    <div style={{ width: "50%", background: "rgba(0,255,65,0.5)"  }} />
                  </div>
                  {/* Marker ▼ */}
                  <div className="relative h-2.5">
                    <span
                      className="absolute text-[9px] -translate-x-1/2 leading-none"
                      style={{ left: `${markerPos * 100}%`, color: "#fff", top: 0 }}
                    >
                      ▼
                    </span>
                  </div>
                  {/* Zone labels */}
                  <div className="flex w-full mt-0.5">
                    <span className="text-[8px] text-center uppercase" style={{ width: "25%", color: "rgba(239,68,68,0.5)" }}>BELOW 0</span>
                    <span className="text-[8px] text-center uppercase" style={{ width: "25%", color: "rgba(245,158,11,0.5)" }}>MARKET</span>
                    <span className="text-[8px] text-center uppercase" style={{ width: "50%", color: "rgba(0,255,65,0.4)" }}>ABOVE MARKET</span>
                  </div>
                </div>
              </div>
            );
          })()}

        </section>

        {/* ── Layer 2: Growth ──────────────────────────────────────────────────── */}
        <section className="rounded overflow-hidden" style={card}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)", background: "#001a00" }}>
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>
              LAYER 2 — GROWTH QUALITY
            </p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(0,255,65,0.4)" }}>
              Historical financials and growth trajectory
            </p>
          </div>
          {/* Bar charts — 5-year actuals */}
          {(() => {
            type FundRow = { fiscal_year: number; revenue: number | null; ebitda: number | null; free_cash_flow: number | null };
            type MetricKey = "revenue" | "ebitda" | "free_cash_flow";
            const rows = fundamentals as FundRow[];
            if (!rows.length) return null;
            const CHART_H = 80;

            const eFirst = rows[0]?.ebitda;
            const eLast  = rows[rows.length - 1]?.ebitda;
            const nyrs   = rows.length - 1;
            const ebitdaCagr = (eFirst && eLast && eFirst > 0 && eLast > 0 && nyrs > 0)
              ? Math.pow(eLast / eFirst, 1 / nyrs) - 1 : null;

            const SIG_STARS: Record<string, number> = {
              "Solid Growth": 5, "Slowing Growth": 4, "Decelerating": 3, "Deteriorating": 2, "Freefall": 1,
            };
            const SIG_COLOR: Record<string, string> = {
              "Solid Growth": "#00ff41", "Slowing Growth": "#00ff41",
              "Decelerating": "#f59e0b", "Deteriorating": "#f59e0b", "Freefall": "#ef4444",
            };
            const FCF_TREND: Record<string, { arrow: string; label: string }> = {
              "Solid Growth":   { arrow: "↑", label: "Growing" },
              "Slowing Growth": { arrow: "↑", label: "Growing" },
              "Decelerating":   { arrow: "→", label: "Slowing" },
              "Deteriorating":  { arrow: "↓", label: "Declining" },
              "Freefall":       { arrow: "↓", label: "Declining" },
            };

            const metrics: { key: MetricKey; label: string; cagr: number | null | undefined; signal: string | null | undefined }[] = [
              { key: "revenue",        label: "REVENUE",        cagr: score?.revenue_cagr_5y,  signal: scoreEx?.gq_signal_revenue },
              { key: "ebitda",         label: "EBITDA",         cagr: ebitdaCagr,               signal: scoreEx?.gq_signal_net_income },
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
                    const maxPos     = Math.max(0, ...nonNull);
                    const maxNeg     = Math.min(0, ...nonNull);
                    const totalRange = maxPos - maxNeg || 1;
                    const negH       = Math.abs(maxNeg) / totalRange * CHART_H;
                    const zeroY      = maxPos            / totalRange * CHART_H;
                    const cagrNum    = cagr != null ? Number(cagr) : null;
                    return (
                      <div key={key}>
                        {/* Header: name+badge left · signal+stars right */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-bold tracking-widest shrink-0" style={{ color: "rgba(0,255,65,0.7)" }}>
                              {label}
                            </span>
                            {key === "free_cash_flow" && signal && FCF_TREND[signal] ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{
                                color: SIG_COLOR[signal] ?? "#00ff41",
                                border: `1px solid ${SIG_COLOR[signal] ?? "#00ff41"}`,
                              }}>
                                {FCF_TREND[signal].arrow} {FCF_TREND[signal].label}
                              </span>
                            ) : cagrNum != null ? (
                              <span className="text-xs font-bold font-mono px-1.5 py-0.5 rounded" style={{
                                background: cagrNum >= 0 ? "rgba(0,255,65,0.08)" : "rgba(248,113,113,0.08)",
                                color:      cagrNum >= 0 ? "rgba(0,255,65,0.7)"  : "#f87171",
                                border:     `1px solid ${cagrNum >= 0 ? "rgba(0,255,65,0.2)" : "rgba(248,113,113,0.3)"}`,
                              }}>
                                {fmtCagr(cagr)} CAGR
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {signal && (
                              <>
                                <span className="text-[10px] font-mono" style={{ color: SIG_COLOR[signal] ?? "rgba(0,255,65,0.5)" }}>
                                  {signal}
                                </span>
                                <span className="text-[10px] font-mono leading-none">
                                  {Array.from({ length: 5 }).map((_, i) => {
                                    const filled = i < (SIG_STARS[signal] ?? 0);
                                    const col = SIG_COLOR[signal] ?? "#00ff41";
                                    return (
                                      <span key={i} style={{ color: filled ? col : col + "4d" }}>
                                        {filled ? "★" : "☆"}
                                      </span>
                                    );
                                  })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {/* Bar area */}
                        {(() => {
                          // Linear regression for trend line
                          const nBars = vals.length;
                          const rVals = vals.map((d, i) => ({ i, v: d.v })).filter(d => d.v != null);
                          let svgLine: { x1: number; y1: number; x2: number; y2: number } | null = null;
                          if (rVals.length >= 2) {
                            const n = rVals.length;
                            const sumX  = rVals.reduce((s, p) => s + p.i, 0);
                            const sumY  = rVals.reduce((s, p) => s + (p.v as number), 0);
                            const sumXY = rVals.reduce((s, p) => s + p.i * (p.v as number), 0);
                            const sumX2 = rVals.reduce((s, p) => s + p.i * p.i, 0);
                            const denom = n * sumX2 - sumX * sumX;
                            const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
                            const intercept = (sumY - slope * sumX) / n;
                            const toSvgY = (v: number) =>
                              Math.max(0, Math.min(CHART_H, zeroY - v / totalRange * CHART_H));
                            svgLine = {
                              x1: 0.5 / nBars * 100,
                              y1: toSvgY(intercept),
                              x2: (nBars - 0.5) / nBars * 100,
                              y2: toSvgY(slope * (nBars - 1) + intercept),
                            };
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
                                            background: isNeg ? "#f87171" : "#00ff41",
                                          }}
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              {svgLine && signal && (
                                <svg
                                  className="absolute inset-0 pointer-events-none"
                                  width="100%" height={CHART_H}
                                  viewBox={`0 0 100 ${CHART_H}`}
                                  preserveAspectRatio="none"
                                >
                                  <line
                                    x1={svgLine.x1} y1={svgLine.y1}
                                    x2={svgLine.x2} y2={svgLine.y2}
                                    stroke={SIG_COLOR[signal] ?? "#00ff41"}
                                    strokeWidth="1"
                                    strokeOpacity="0.5"
                                    vectorEffect="non-scaling-stroke"
                                  />
                                </svg>
                              )}
                            </div>
                          );
                        })()}
                        {/* Value + year labels */}
                        <div className="flex gap-1.5 mt-1.5">
                          {vals.map(({ year, v, isNeg }) => (
                            <div key={year} className="flex-1 text-center" style={{ minWidth: 0 }}>
                              <span className="block text-[11px] font-mono font-bold leading-tight" style={{ color: isNeg ? "rgba(248,113,113,0.6)" : "rgba(0,255,65,0.5)" }}>
                                {v != null ? fmtBn(Math.abs(v)) : "—"}
                              </span>
                              <span className="block text-[10px] font-mono leading-tight" style={{ color: "rgba(0,255,65,0.2)" }}>
                                {year}
                              </span>
                            </div>
                          ))}
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
                const revSig  = scoreEx?.gq_signal_revenue    ?? null;
                const niSig   = scoreEx?.gq_signal_net_income ?? null;
                const fcfSig  = scoreEx?.gq_signal_fcf        ?? null;
                const revPts  = Math.round(cagrToScore(revCagr));
                const niPts   = Math.round(cagrToScore(niCagr));
                const fcfPts  = fcfSig != null ? Math.round((SIG_STARS[fcfSig] ?? 0) / 5 * 100) : null;
                const TREND_MULT: Record<string, number> = {
                  "Solid Growth": 1.00, "Slowing Growth": 0.90,
                  "Decelerating": 0.75, "Deteriorating": 0.50, "Freefall": 0.25,
                };
                const allSigs    = [revSig, niSig, fcfSig].filter(Boolean) as string[];
                const worstMult  = allSigs.length ? Math.min(...allSigs.map(s => TREND_MULT[s] ?? 1.0)) : 1.0;
                const worstSig   = allSigs.find(s => (TREND_MULT[s] ?? 1.0) === worstMult) ?? null;
                const hasPenalty = worstMult <= 0.75;
                const miniRows = [
                  { name: "REVENUE", sig: revSig, pts: revPts,  cagr: revCagr, isFcf: false },
                  { name: "EBITDA",  sig: niSig,  pts: niPts,   cagr: niCagr,  isFcf: false },
                  { name: "FCF",     sig: fcfSig, pts: fcfPts,  cagr: null,    isFcf: true  },
                ];
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
                    <div className="space-y-2">
                      {miniRows.map(({ name, sig, pts, cagr, isFcf }) => {
                        const sigColor = sig ? (SIG_COLOR[sig] ?? "#00ff41") : "rgba(0,255,65,0.3)";
                        const ptsNum   = pts ?? 0;
                        return (
                          <div key={name} className="flex items-center gap-2">
                            <span className="text-[10px] font-mono w-14 shrink-0" style={{ color: "rgba(0,255,65,0.5)" }}>{name}</span>
                            <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(0,255,65,0.1)" }}>
                              <div className="h-full rounded-full" style={{ width: `${ptsNum}%`, background: sigColor }} />
                            </div>
                            <span className="text-[10px] font-mono w-10 text-right shrink-0" style={{ color: sigColor }}>
                              {pts != null ? `${pts}pts` : "—"}
                            </span>
                            <span className="text-[9px] font-mono w-20 text-right shrink-0" style={{ color: "rgba(0,255,65,0.4)" }}>
                              {isFcf
                                ? (sig && FCF_TREND[sig] ? FCF_TREND[sig].label : (sig ?? "—"))
                                : cagr != null ? fmtCagr(cagr) : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[9px] italic text-center mt-3" style={{
                      color: hasPenalty ? "rgba(251,191,36,0.7)" : "rgba(0,255,65,0.5)",
                    }}>
                      {hasPenalty && worstSig
                        ? `Trend penalty applied: ${worstSig} (×${worstMult.toFixed(2)})`
                        : "No trend penalty applied"}
                    </p>
                  </div>
                );
              })()}
              </>
            );
          })()}
        </section>

        {/* ── Layer 3: Health — 24 checks ──────────────────────────────────────── */}
        <section className="rounded overflow-hidden" style={card}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)", background: "#001a00" }}>
            <p className="text-xs font-bold tracking-widest mb-3" style={{ color: "#00ff41" }}>
              LAYER 3 — FINANCIAL HEALTH
            </p>
            <div className="flex gap-6 mb-3">
              <div>
                <p className="text-2xl font-bold font-mono" style={{ color: scoreColor(score?.health_score) }}>
                  {score?.health_passes ?? 0}/{scoredTotal}
                </p>
                <p className="text-[10px] tracking-widest" style={{ color: scoreColor(score?.health_score) }}>CHECKS PASSED</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono" style={{ color: scoreColor(score?.health_score) }}>
                  {score?.health_score != null ? `${Number(score.health_score).toFixed(1)}%` : "—"}
                </p>
                <p className="text-[10px] tracking-widest" style={{ color: scoreColor(score?.health_score) }}>HEALTH SCORE</p>
              </div>
            </div>
            <div className="h-1 rounded-full w-full" style={{ background: "rgba(255,255,255,0.1)" }}>
              <div className="h-full rounded-full" style={{ width: `${score?.health_score ?? 0}%`, background: healthColor(score?.health_score) }} />
            </div>
          </div>

          <HealthCategories cats={healthCats} />
        </section>

        {/* ── Layer 4: Final ───────────────────────────────────────────────────── */}
        <section className="rounded overflow-hidden" style={card}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)", background: "#001a00" }}>
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>
              LAYER 4 — FINAL SCORE
            </p>
          </div>
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
                        ? `${score?.ppm_cagr != null ? `${(Number(score.ppm_cagr) * 100).toFixed(1)}% CAGR` : "—"} vs S&P ${scoreEx?.sp500_cagr != null ? `${(Number(scoreEx.sp500_cagr) * 100).toFixed(1)}%` : "—"} benchmark`
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
                  BUY:  { background: "rgba(0,255,65,0.15)",  color: "#00ff41", border: "1px solid rgba(0,255,65,0.6)" },
                  HOLD: { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.5)" },
                  SELL: { background: "rgba(239,68,68,0.15)",  color: "#ef4444", border: "1px solid rgba(239,68,68,0.5)" },
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
        </section>

        <p className="text-center text-xs pb-4 tracking-wide" style={{ color: "rgba(0,255,65,0.2)" }}>
          DATA · FINANCIALMODELINGPREP · SCORES UPDATED WEEKLY
        </p>
      </div>
    </div>
  );
}
