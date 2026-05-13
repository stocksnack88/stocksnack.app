import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";
import UpgradeButton from "@/components/ui/UpgradeButton";
import DescriptionToggle from "@/components/ui/DescriptionToggle";

const FREE_LIMIT = 5;

const HEALTH_CATEGORIES = [
  { label: "BALANCE SHEET", count: 7 },
  { label: "INCOME STATEMENT", count: 7 },
  { label: "CASH FLOW", count: 5 },
  { label: "BUFFETT TIER", count: 5 },
] as const;

type HealthCheck = {
  name: string;
  pass: boolean;
  score: number;
  years_passed: number;
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

function ScoreBar({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  const color = scoreColor(value);
  return (
    <div className="flex items-center gap-3 min-w-[140px]">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-sm font-bold font-mono w-12 text-right" style={{ color }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
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
          {([
            {
              label: "5Y RETURN VS S&P 500",
              value: (
                <span className="font-mono font-bold text-sm">
                  <span style={{ color: "#00ff41" }}>
                    {currentPrice && blendedPrice ? `${(blendedPrice / currentPrice).toFixed(1)}x` : "—"}
                  </span>
                  <span className="mx-2" style={{ color: "rgba(0,255,65,0.3)" }}>vs</span>
                  <span style={{ color: "rgba(0,255,65,0.5)" }}>
                    {scoreEx?.sp500_5y_return != null ? `${Number(scoreEx.sp500_5y_return).toFixed(1)}x` : "—"}
                  </span>
                </span>
              ),
            },
            {
              label: "CAGR VS S&P 500",
              value: (
                <span className="font-mono font-bold text-sm">
                  <span style={{ color: "#00ff41" }}>{fmtCagr(score?.ppm_cagr)}</span>
                  <span className="mx-2" style={{ color: "rgba(0,255,65,0.3)" }}>vs</span>
                  <span style={{ color: "rgba(0,255,65,0.5)" }}>
                    {scoreEx?.sp500_cagr != null ? fmtCagr(scoreEx.sp500_cagr) : "—"}
                  </span>
                </span>
              ),
            },
            {
              label: "GROWTH QUALITY",
              value: (
                <span className="font-mono font-bold text-sm" style={{ color: "#00ff41" }}>
                  {score?.growth_score != null ? fmtPct(Number(score.growth_score)) : "—"}
                </span>
              ),
            },
            {
              label: "FINANCIAL HEALTH",
              value: (
                <span className="whitespace-nowrap">
                  {score?.health_passes != null ? (
                    <>
                      <span className="font-mono font-bold text-sm" style={{ color: "#00ff41" }}>{score.health_passes} / 24</span>
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
          ))}
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
                <div className="px-5 py-4" style={{ borderBottom: geoSegs.length > 0 ? "1px solid rgba(0,255,65,0.1)" : undefined }}>
                  <p className="text-xs font-bold tracking-widest mb-3" style={{ color: "rgba(0,255,65,0.4)" }}>PRODUCT BREAKDOWN</p>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[9px] tracking-widest flex-1" style={{ color: "rgba(0,255,65,0.3)" }}>REVENUE SHARE</span>
                    <span className="text-[9px] tracking-widest shrink-0" style={{ color: "rgba(0,255,65,0.3)" }}>SHARE</span>
                    <span className="text-[9px] tracking-widest shrink-0 w-16 text-right" style={{ color: "rgba(0,255,65,0.3)" }}>CAGR</span>
                  </div>
                  <div className="space-y-3">
                    {productSegs.map((seg) => (
                      <div key={seg.name}>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs flex-1 min-w-0 truncate" style={{ color: "rgba(0,255,65,0.7)" }}>{seg.name}</span>
                          <span className="text-xs font-mono shrink-0" style={{ color: "#00ff41" }}>{seg.pct.toFixed(1)}%</span>
                          <span className="text-xs font-mono shrink-0 w-16 text-right" style={{ color: seg.cagr == null ? "#666" : seg.cagr >= 0 ? "#00ff41" : "#f87171" }}>
                            {seg.cagr == null ? "—" : fmtCagr(seg.cagr)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full w-full" style={{ background: "rgba(0,255,65,0.1)" }}>
                          <div className="h-full rounded-full" style={{ width: `${seg.pct}%`, background: "#00ff41" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Geographic Revenue */}
              {geoSegs.length > 0 && (
                <div className="px-5 py-4">
                  <p className="text-xs font-bold tracking-widest mb-3" style={{ color: "rgba(0,255,65,0.4)" }}>GEOGRAPHIC BREAKDOWN</p>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[9px] tracking-widest flex-1" style={{ color: "rgba(0,255,65,0.3)" }}>REVENUE SHARE</span>
                    <span className="text-[9px] tracking-widest shrink-0" style={{ color: "rgba(0,255,65,0.3)" }}>SHARE</span>
                    <span className="text-[9px] tracking-widest shrink-0 w-16 text-right" style={{ color: "rgba(0,255,65,0.3)" }}>CAGR</span>
                  </div>
                  <div className="space-y-3">
                    {geoSegs.map((seg) => (
                      <div key={seg.name}>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs flex-1 min-w-0 truncate" style={{ color: "rgba(0,255,65,0.7)" }}>{seg.name}</span>
                          <span className="text-xs font-mono shrink-0" style={{ color: "#00ff41" }}>{seg.pct.toFixed(1)}%</span>
                          <span className="text-xs font-mono shrink-0 w-16 text-right" style={{ color: seg.cagr == null ? "#666" : seg.cagr >= 0 ? "#00ff41" : "#f87171" }}>
                            {seg.cagr == null ? "—" : fmtCagr(seg.cagr)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full w-full" style={{ background: "rgba(0,255,65,0.1)" }}>
                          <div className="h-full rounded-full" style={{ width: `${seg.pct}%`, background: "#00ff41" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
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

          {/* 3 method cards — shared-row CSS grid */}
          {(() => {
            const m3na = scoreEx?.m3_applicable === false || !score?.ppm_m3_price || Number(score.ppm_m3_price) === 0;
            const m3 = (cls: string) => `${cls}${m3na ? " opacity-40" : ""}`;
            const r = "border-r border-[rgba(0,255,65,0.1)]";
            const stepBox = "border border-[rgba(0,255,65,0.1)] rounded p-1 text-center";
            return (
              <div className="grid grid-cols-3" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>

                {/* ROW 1 — Method headers */}
                <div className={`px-3 pt-2 pb-1 text-center ${r}`}>
                  <p className="text-xs tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.2)" }}>METHOD 1</p>
                  <p className="text-xs font-bold tracking-wider" style={{ color: "#00ff41" }}>EARNINGS GROWTH</p>
                </div>
                <div className={`px-3 pt-2 pb-1 text-center ${r}`}>
                  <p className="text-xs tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.2)" }}>METHOD 2</p>
                  <p className="text-xs font-bold tracking-wider" style={{ color: "#00ff41" }}>FREE CASH FLOW</p>
                </div>
                <div className={m3("px-3 pt-2 pb-1 text-center")}>
                  <p className="text-xs tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.2)" }}>METHOD 3</p>
                  <p className="text-xs font-bold tracking-wider" style={{ color: "#00ff41" }}>DIVIDENDS</p>
                </div>

                {/* ROW 2 — Step ①: Current Price */}
                <div className={`px-3 py-1 ${r}`}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[1]</span> CURRENT PRICE</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(currentPrice)}</p>
                </div></div>
                <div className={`px-3 py-1 ${r}`}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[1]</span> CURRENT PRICE</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(currentPrice)}</p>
                </div></div>
                <div className={m3("px-3 py-1")}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[1]</span> CURRENT PRICE</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(currentPrice)}</p>
                </div></div>

                {/* Arrow row */}
                <div className={`text-center text-[9px] leading-none py-0 ${r}`} style={{ color: "rgba(0,255,65,0.25)" }}>↓</div>
                <div className={`text-center text-[9px] leading-none py-0 ${r}`} style={{ color: "rgba(0,255,65,0.25)" }}>↓</div>
                <div className={m3("text-center text-[9px] leading-none py-0")} style={{ color: "rgba(0,255,65,0.25)" }}>↓</div>

                {/* ROW 3 — Step ②: EBITDA / FCF / Dividend Yield */}
                <div className={`px-3 py-1 ${r}`}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[2]</span> CURRENT EBITDA</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtBn(scoreEx?.m1_ebitda_current)}</p>
                </div></div>
                <div className={`px-3 py-1 ${r}`}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[2]</span> CURRENT FCF</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtBn(scoreEx?.m2_fcf_current)}</p>
                </div></div>
                <div className={m3("px-3 py-1")}>
                  {m3na ? (
                    <div className="text-center pt-1">
                      <p className="text-[9px] font-bold tracking-widest mb-1" style={{ color: "rgba(0,255,65,0.7)" }}>NOT APPLICABLE</p>
                      <p className="text-[9px] leading-relaxed" style={{ color: "rgba(0,255,65,0.6)" }}>
                        {scoreEx?.m3_div_yield != null && Number(scoreEx.m3_div_yield) > 0
                          ? `Dividend yield ${(Number(scoreEx.m3_div_yield) * 100).toFixed(1)}% — below risk-free rate of 4.5%`
                          : "No consistent dividend history"}
                      </p>
                    </div>
                  ) : (
                    <div className={stepBox}>
                      <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[2]</span> DIVIDEND YIELD</p>
                      <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>
                        {scoreEx?.m3_div_yield != null ? `${(Number(scoreEx.m3_div_yield) * 100).toFixed(1)}%` : "—"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Arrow row — above ROW 3.5 annotation */}
                <div className={`text-center text-[9px] leading-none py-0 ${r}`} style={{ color: "rgba(0,255,65,0.4)" }}>↓</div>
                <div className={`text-center text-[9px] leading-none py-0 ${r}`} style={{ color: "rgba(0,255,65,0.4)" }}>↓</div>
                <div className={m3("text-center text-[9px] leading-none py-0")} style={{ color: "rgba(0,255,65,0.4)" }}>↓</div>

                {/* ROW 3.5 — Annotation */}
                <div className={`px-3 py-0.5 text-center ${r}`}>
                  <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                    Growing at {scoreEx?.m1_growth_rate != null ? `${(Number(scoreEx.m1_growth_rate) * 100).toFixed(1)}%` : "—"} p.a.
                  </p>
                </div>
                <div className={`px-3 py-0.5 text-center ${r}`}>
                  <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                    Growing at {scoreEx?.m2_growth_rate != null ? `${(Number(scoreEx.m2_growth_rate) * 100).toFixed(1)}%` : "—"} p.a.
                  </p>
                </div>
                <div className={m3("px-3 py-1")} />

                {/* Arrow row */}
                <div className={`text-center text-[9px] leading-none py-0 ${r}`} style={{ color: "rgba(0,255,65,0.25)" }}>↓</div>
                <div className={`text-center text-[9px] leading-none py-0 ${r}`} style={{ color: "rgba(0,255,65,0.25)" }}>↓</div>
                <div className={m3("text-center text-[9px] leading-none py-0")} style={{ color: "rgba(0,255,65,0.25)" }}>↓</div>

                {/* ROW 4 — Step ③: Projected EBITDA / FCF / Price Growth */}
                <div className={`px-3 py-1 ${r}`}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[3]</span> PROJECT 5Y EBITDA</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtBn(scoreEx?.m1_ebitda_projected)}</p>
                </div></div>
                <div className={`px-3 py-1 ${r}`}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[3]</span> PROJECT 5Y FCF</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtBn(scoreEx?.m2_fcf_projected)}</p>
                </div></div>
                <div className={m3("px-3 py-1")}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[3]</span> PRICE GROWTH</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>
                    {scoreEx?.m3_growth_rate != null ? `${(Number(scoreEx.m3_growth_rate) * 100).toFixed(1)}%` : "—"} p.a.
                  </p>
                </div></div>

                {/* Arrow row — above ROW 4.5 annotation */}
                <div className={`text-center text-[9px] leading-none py-0 ${r}`} style={{ color: "rgba(0,255,65,0.4)" }}>↓</div>
                <div className={`text-center text-[9px] leading-none py-0 ${r}`} style={{ color: "rgba(0,255,65,0.4)" }}>↓</div>
                <div className={m3("text-center text-[9px] leading-none py-0")} style={{ color: "rgba(0,255,65,0.4)" }}>↓</div>

                {/* ROW 4.5 — Annotation */}
                <div className={`px-3 py-0.5 text-center ${r}`}>
                  <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                    At {scoreEx?.m1_ev_ebitda_multiple != null ? `${Number(scoreEx.m1_ev_ebitda_multiple).toFixed(0)}x` : "—"} earnings multiple
                  </p>
                </div>
                <div className={`px-3 py-0.5 text-center ${r}`}>
                  <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                    At {scoreEx?.m2_fcf_yield != null ? `${(Number(scoreEx.m2_fcf_yield) * 100).toFixed(1)}%` : "—"} cash flow yield
                  </p>
                </div>
                <div className={m3("px-3 py-0.5 text-center")}>
                  {!m3na && scoreEx?.m3_div_yield != null && scoreEx?.m3_growth_rate != null && (
                    <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>
                      Combined: {((Number(scoreEx.m3_div_yield) + Number(scoreEx.m3_growth_rate)) * 100).toFixed(1)}% annual return
                    </p>
                  )}
                </div>

                {/* Arrow row */}
                <div className={`text-center text-[9px] leading-none py-0 ${r}`} style={{ color: "rgba(0,255,65,0.25)" }}>↓</div>
                <div className={`text-center text-[9px] leading-none py-0 ${r}`} style={{ color: "rgba(0,255,65,0.25)" }}>↓</div>
                <div className={m3("text-center text-[9px] leading-none py-0")} style={{ color: "rgba(0,255,65,0.25)" }}>↓</div>

                {/* ROW 4 — Step [4]: Estimated Future Price */}
                <div className={`px-3 py-1 ${r}`}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[4]</span> ESTIMATED FUTURE PRICE</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(score?.ppm_m1_price)}</p>
                </div></div>
                <div className={`px-3 py-1 ${r}`}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[4]</span> ESTIMATED FUTURE PRICE</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(score?.ppm_m2_price)}</p>
                </div></div>
                <div className={m3("px-3 py-1")}><div className={stepBox}>
                  <p className="text-[8px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}><span className="text-[9px] font-bold">[4]</span> ESTIMATED FUTURE PRICE</p>
                  <p className="text-xs font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(score?.ppm_m3_price)}</p>
                </div></div>

                {/* Arrow row — above dividend annotation */}
                <div className={`text-center text-[9px] leading-none py-0 ${r}`} style={{ color: "rgba(0,255,65,0.4)" }}>↓</div>
                <div className={`text-center text-[9px] leading-none py-0 ${r}`} style={{ color: "rgba(0,255,65,0.4)" }}>↓</div>
                <div className={m3("text-center text-[9px] leading-none py-0")} style={{ color: "rgba(0,255,65,0.4)" }}>↓</div>

                {/* Dividend annotation row + Step [5]: Total Return Price */}
                {(() => {
                  const cumDivPs = scoreEx?.m_cumulative_div_ps != null ? Number(scoreEx.m_cumulative_div_ps) : 0;
                  const divLabel = `+ $${cumDivPs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} dividends received over 5Y`;
                  return (
                    <>
                      {/* Annotation */}
                      <div className={`px-3 py-0.5 text-center ${r}`}>
                        <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>{divLabel}</p>
                      </div>
                      <div className={`px-3 py-0.5 text-center ${r}`}>
                        <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>{divLabel}</p>
                      </div>
                      <div className={m3("px-3 py-0.5 text-center")}>
                        <p className="text-[9px] italic" style={{ color: "rgba(0,255,65,0.35)" }}>{divLabel}</p>
                      </div>

                      {/* Arrow row */}
                      <div className={`text-center text-[9px] leading-none py-0 ${r}`} style={{ color: "rgba(0,255,65,0.25)" }}>↓</div>
                      <div className={`text-center text-[9px] leading-none py-0 ${r}`} style={{ color: "rgba(0,255,65,0.25)" }}>↓</div>
                      <div className={m3("text-center text-[9px] leading-none py-0")} style={{ color: "rgba(0,255,65,0.25)" }}>↓</div>

                      {/* ROW 5 — Step [5]: Total Return Price (hero box) */}
                      <div className={`px-3 pt-1 pb-2 ${r}`}>
                        <div className="rounded p-2 text-center" style={{ background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.55)" }}>
                          <p className="text-[8px] tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.4)" }}><span className="font-bold">[5]</span> TOTAL RETURN PRICE</p>
                          <p className="text-lg font-bold font-mono" style={{ color: "#00ff41" }}>{fmtDollar(score?.ppm_m1_price != null ? Number(score.ppm_m1_price) + cumDivPs : null)}</p>
                        </div>
                      </div>
                      <div className={`px-3 pt-1 pb-2 ${r}`}>
                        <div className="rounded p-2 text-center" style={{ background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.55)" }}>
                          <p className="text-[8px] tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.4)" }}><span className="font-bold">[5]</span> TOTAL RETURN PRICE</p>
                          <p className="text-lg font-bold font-mono" style={{ color: "#00ff41" }}>{fmtDollar(score?.ppm_m2_price != null ? Number(score.ppm_m2_price) + cumDivPs : null)}</p>
                        </div>
                      </div>
                      <div className={m3("px-3 pt-1 pb-2")}>
                        <div className="rounded p-2 text-center" style={{ background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.55)" }}>
                          <p className="text-[8px] tracking-widest mb-0.5" style={{ color: "rgba(0,255,65,0.4)" }}><span className="font-bold">[5]</span> TOTAL RETURN PRICE</p>
                          <p className="text-lg font-bold font-mono" style={{ color: "#00ff41" }}>{fmtDollar(score?.ppm_m3_price != null ? Number(score.ppm_m3_price) + cumDivPs : null)}</p>
                        </div>
                      </div>
                    </>
                  );
                })()}

              </div>
            );
          })()}

          {/* Blended projection */}
          <div className="px-5 py-6 text-center" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
            <p className="text-[9px] font-bold tracking-[0.3em] mb-2" style={{ color: "rgba(0,255,65,0.3)" }}>BLENDED PROJECTION</p>
            <p className="text-4xl font-bold font-mono" style={{ color: "#00ff41" }}>{fmtDollar(blendedPrice)}</p>
            <p className="text-[9px] tracking-widest mt-1.5" style={{ color: "rgba(0,255,65,0.3)" }}>5-YEAR PRICE TARGET</p>
          </div>

          {/* Return summary */}
          <div className="px-5 py-4 flex flex-wrap items-center justify-center gap-6 text-center">
            <div>
              <p className="text-[9px] tracking-[0.3em] mb-1" style={{ color: "rgba(0,255,65,0.3)" }}>CURRENT</p>
              <p className="text-sm font-bold font-mono" style={{ color: "rgba(0,255,65,0.7)" }}>{fmtDollar(currentPrice)}</p>
            </div>
            <span style={{ color: "rgba(0,255,65,0.25)" }}>→</span>
            <div>
              <p className="text-[9px] tracking-[0.3em] mb-1" style={{ color: "rgba(0,255,65,0.3)" }}>PROJECTED</p>
              <p className="text-sm font-bold font-mono" style={{ color: "#00ff41" }}>{fmtDollar(blendedPrice)}</p>
            </div>
            <span style={{ color: "rgba(0,255,65,0.25)" }}>·</span>
            <div>
              <p className="text-[9px] tracking-[0.3em] mb-1" style={{ color: "rgba(0,255,65,0.3)" }}>IMPLIED RETURN</p>
              <p className="text-sm font-bold font-mono" style={{ color: "#00ff41" }}>
                {currentPrice && blendedPrice ? `${(blendedPrice / currentPrice).toFixed(1)}x` : "—"}
              </p>
            </div>
            <span style={{ color: "rgba(0,255,65,0.25)" }}>·</span>
            <div>
              <p className="text-[9px] tracking-[0.3em] mb-1" style={{ color: "rgba(0,255,65,0.3)" }}>5Y CAGR</p>
              <p className="text-sm font-bold font-mono" style={{ color: "#00ff41" }}>{fmtCagr(score?.ppm_cagr)}</p>
            </div>
          </div>
        </section>

        {/* ── Layer 2: Growth ──────────────────────────────────────────────────── */}
        <section className="rounded overflow-hidden" style={card}>
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)", background: "#001a00" }}>
            <div>
              <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>
                LAYER 2 — GROWTH QUALITY
              </p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(0,255,65,0.4)" }}>
                Historical financials and growth trajectory
              </p>
            </div>
            <ScoreBar value={score?.growth_score} />
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
              "Decelerating": "#fbbf24", "Deteriorating": "#fb923c", "Freefall": "#f87171",
            };

            const metrics: { key: MetricKey; label: string; cagr: number | null | undefined; signal: string | null | undefined }[] = [
              { key: "revenue",        label: "REVENUE",        cagr: score?.revenue_cagr_5y,  signal: scoreEx?.gq_signal_revenue },
              { key: "ebitda",         label: "EBITDA",         cagr: ebitdaCagr,               signal: scoreEx?.gq_signal_net_income },
              { key: "free_cash_flow", label: "FREE CASH FLOW", cagr: score?.fcf_cagr_5y,      signal: scoreEx?.gq_signal_fcf },
            ];

            return (
              <div className="px-5 pb-5" style={{ borderTop: "1px solid rgba(0,255,65,0.1)" }}>
                <div className="pt-4 pb-2 mb-3" style={{ borderBottom: "1px solid rgba(0,255,65,0.3)" }}>
                  <p className="text-base font-bold leading-tight" style={{ color: "#00ff41" }}>HISTORICAL FINANCIALS</p>
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
                        {/* Label + CAGR badge */}
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-[9px] font-bold tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>
                            {label}
                          </span>
                          {cagrNum != null && (
                            <span className="text-xs font-bold font-mono px-1.5 py-0.5 rounded" style={{
                              background: cagrNum >= 0 ? "rgba(0,255,65,0.08)" : "rgba(248,113,113,0.08)",
                              color:      cagrNum >= 0 ? "rgba(0,255,65,0.7)"  : "#f87171",
                              border:     `1px solid ${cagrNum >= 0 ? "rgba(0,255,65,0.2)" : "rgba(248,113,113,0.3)"}`,
                            }}>
                              {fmtCagr(cagr)} CAGR
                            </span>
                          )}
                        </div>
                        {/* Growth quality signal */}
                        {signal && (
                          <div className="flex items-center gap-1 mb-2">
                            <span className="text-[9px] tracking-widest font-mono" style={{ color: "rgba(0,255,65,0.3)" }}>
                              GROWTH QUALITY:
                            </span>
                            <span className="text-[9px] font-mono" style={{ color: SIG_COLOR[signal] ?? "rgba(0,255,65,0.5)" }}>
                              {signal}
                            </span>
                            <span className="text-[9px] font-mono" style={{ color: SIG_COLOR[signal] ?? "rgba(0,255,65,0.5)" }}>
                              {"★".repeat(SIG_STARS[signal] ?? 0)}
                              <span style={{ color: "rgba(0,255,65,0.2)" }}>{"☆".repeat(5 - (SIG_STARS[signal] ?? 0))}</span>
                            </span>
                          </div>
                        )}
                        {/* Bar area */}
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
                        </div>
                        {/* Value + year labels */}
                        <div className="flex gap-1.5 mt-1.5">
                          {vals.map(({ year, v, isNeg }) => (
                            <div key={year} className="flex-1 text-center" style={{ minWidth: 0 }}>
                              <span className="block text-[7px] font-mono font-bold leading-tight truncate" style={{ color: isNeg ? "rgba(248,113,113,0.6)" : "rgba(0,255,65,0.5)" }}>
                                {v != null ? fmtBn(Math.abs(v)) : "—"}
                              </span>
                              <span className="block text-[7px] font-mono leading-tight" style={{ color: "rgba(0,255,65,0.2)" }}>
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
            );
          })()}
        </section>

        {/* ── Layer 3: Health — 24 checks ──────────────────────────────────────── */}
        <section className="rounded overflow-hidden" style={card}>
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)", background: "#001a00" }}>
            <div>
              <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>
                LAYER 3 — FINANCIAL HEALTH
              </p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(0,255,65,0.4)" }}>
                24 Buffett-style pass/fail checks · {score?.health_passes ?? 0}/24 passing
              </p>
            </div>
            <ScoreBar value={score?.health_score} />
          </div>

          {healthCats.map((cat, catIdx) => (
            <div
              key={cat.label}
              style={catIdx < healthCats.length - 1 ? { borderBottom: "1px solid rgba(0,255,65,0.1)" } : {}}
            >
              <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                <p className="text-xs font-bold tracking-widest" style={{ color: "rgba(0,255,65,0.5)" }}>
                  {cat.label}
                </p>
                <p className="text-xs font-mono" style={{ color: "rgba(0,255,65,0.4)" }}>
                  {cat.checks.filter((c) => c.pass).length}/{cat.count} PASS
                </p>
              </div>
              <div className="px-5 pb-4 space-y-2">
                {cat.checks.length === 0 ? (
                  <p className="text-xs" style={{ color: "rgba(0,255,65,0.25)" }}>No data</p>
                ) : (
                  cat.checks.map((check, i) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <span className="text-xs flex-1 min-w-0 leading-relaxed" style={{ color: "rgba(0,255,65,0.65)" }}>{check.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono" style={{ color: "rgba(0,255,65,0.25)" }}>
                          {check.years_passed}/5 yrs
                        </span>
                        <span
                          className="inline-block text-center text-xs font-bold tracking-widest rounded"
                          style={{
                            minWidth: 44,
                            padding: "2px 8px",
                            ...(check.pass
                              ? { background: "rgba(0,255,65,0.12)", color: "#00ff41", border: "1px solid rgba(0,255,65,0.4)" }
                              : { background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.35)" }),
                          }}
                        >
                          {check.pass ? "PASS" : "FAIL"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </section>

        {/* ── Layer 4: Final ───────────────────────────────────────────────────── */}
        <section className="rounded overflow-hidden" style={card}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)", background: "#001a00" }}>
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>
              LAYER 4 — FINAL SCORE
            </p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(0,255,65,0.4)" }}>
              PPM 40% · Growth 30% · Health 30%
            </p>
          </div>
          <div className="px-5 py-6 flex flex-wrap items-center gap-4 sm:gap-8">
            <div className="text-center">
              <p
                className="text-5xl font-bold font-mono"
                style={{ color: scoreColor(score?.final_score) }}
              >
                {score?.final_score !== null && score?.final_score !== undefined
                  ? Number(score.final_score).toFixed(1)
                  : "—"}
              </p>
              <p className="text-xs mt-2 tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>
                FINAL SCORE
              </p>
            </div>
            <div className="flex-1 min-w-[140px]">
              <ScoreBar value={score?.final_score} />
            </div>
            <div className="text-center">
              <SignalBadge signal={score?.signal} />
              <p className="text-xs mt-2 tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>SIGNAL</p>
            </div>
          </div>
          <div className="px-5 pb-5">
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              {[
                { label: "PPM", value: score?.ppm_score },
                { label: "GROWTH", value: score?.growth_score },
                { label: "HEALTH", value: score?.health_score },
              ].map(({ label, value }) => (
                <div key={label} className="rounded py-2.5" style={{ border: "1px solid rgba(0,255,65,0.1)", background: "rgba(0,255,65,0.02)" }}>
                  <p className="tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>{label}</p>
                  <p className="font-bold mt-0.5" style={{ color: "#00ff41" }}>
                    {value !== null && value !== undefined ? Number(value).toFixed(1) : "—"}
                  </p>
                </div>
              ))}
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
