import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";
import UpgradeButton from "@/components/ui/UpgradeButton";
import DescriptionToggle from "@/components/ui/DescriptionToggle";

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

const HEALTH_EXPLANATIONS: { key: string; pass: string; fail: string }[] = [
  // Balance Sheet
  { key: "cash/debt",           pass: "Holds more cash than debt — financially secure",                          fail: "Debt exceeds cash — vulnerable in a downturn" },
  { key: "debt/equity",         pass: "Low borrowing vs assets — low financial risk",                            fail: "Heavy borrowing vs assets — higher financial risk" },
  { key: "preferred stock",     pass: "No preferred shareholders ahead of you in the queue",                     fail: "Preferred shareholders get paid before you do" },
  { key: "retained earnings",   pass: "Savings growing year after year — compounding internally",                fail: "Savings shrinking — profits not being retained effectively" },
  { key: "active buybacks",     pass: "Buying back shares — your ownership slice grows",                         fail: "No buybacks — ownership not being returned to shareholders" },
  { key: "roe",                 pass: "Strong returns on shareholder money — a quality business",                fail: "Weak returns on shareholder money — money not being used efficiently" },
  { key: "rota",                pass: "Squeezes strong profit from every asset it owns",                         fail: "Assets not generating enough profit — inefficient operations" },
  // Income Statement
  { key: "gross margin",        pass: "Keeps a healthy chunk after costs — real pricing power",                  fail: "Thin margins after costs — limited pricing power" },
  { key: "sg&a",                pass: "Admin costs are lean — more profit reaches the bottom line",              fail: "High admin costs eating into gross profit" },
  { key: "r&d",                 pass: "Research spending is controlled — not burning cash on bets",              fail: "Heavy R&D spend — high risk, uncertain payoff" },
  { key: "interest",            pass: "Debt interest is small — not enslaved to lenders",                       fail: "Large chunk of earnings going to debt interest payments" },
  { key: "tax rate",            pass: "Pays fair taxes — clean straightforward accounting",                      fail: "Tax rate outside normal range — unusual, check the reason" },
  { key: "net margin",          pass: "Keeps 20+ cents of every dollar earned — highly profitable",              fail: "Keeps less than 20 cents per dollar — thin profitability" },
  { key: "eps growth",          pass: "Earnings per share growing — each share worth more over time",            fail: "Earnings per share shrinking — each share worth less" },
  // Cash Flow
  { key: "sbc",                 pass: "Staff share pay is controlled — ownership not being diluted",             fail: "Excessive share-based pay quietly diluting your stake" },
  { key: "ocf",                 pass: "Profit backed by real cash — not accounting tricks",                      fail: "Profits may not be real cash — quality of earnings is low" },
  { key: "fcf growth",          pass: "Spendable cash growing consistently year after year",                     fail: "Spendable cash shrinking — less financial flexibility" },
  { key: "capex",               pass: "Doesn't need heavy investment to keep growing — capital light",           fail: "Needs heavy reinvestment just to maintain operations" },
  { key: "payout ratio",        pass: "Dividends and buybacks fully covered by real cash flow",                  fail: "Returning more cash than it generates — unsustainable" },
  // Business Traits
  { key: "consistent earnings", pass: "Profits show up reliably every year — predictable business",              fail: "Erratic earnings — dependent on unpredictable events" },
  { key: "dilution",            pass: "Share count stable — not printing shares that shrink your piece",         fail: "Share count growing — your ownership being diluted" },
  { key: "intangibles",         pass: "Value from real operations — not goodwill that can vanish",               fail: "High goodwill or intangibles — value could disappear if brand weakens" },
  { key: "debt payoff",         pass: "Could clear all debt within 4 years of profit",                          fail: "Would take over 4 years of total profit just to clear debt" },
  { key: "retained test",       pass: "Every dollar kept has grown the stock's market value",                    fail: "Retaining profits but failing to grow market value" },
];

function getCheckExplanation(name: string, pass: boolean): string {
  const lower = name.toLowerCase();
  const entry = HEALTH_EXPLANATIONS.find((e) => lower.includes(e.key));
  return entry ? (pass ? entry.pass : entry.fail) : "";
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
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="text-[9px] tracking-widest font-mono" style={{ color: "rgba(0,255,65,0.3)" }}>
                              GROWTH QUALITY:
                            </span>
                            <span className="text-[9px] font-mono" style={{ color: SIG_COLOR[signal] ?? "rgba(0,255,65,0.5)" }}>
                              {signal}
                            </span>
                            {key === "free_cash_flow" ? (
                              <span className="text-xs font-mono font-bold" style={{ color: SIG_COLOR[signal] ?? "rgba(0,255,65,0.5)" }}>
                                {FCF_TREND[signal]?.arrow ?? "→"} {FCF_TREND[signal]?.label ?? signal}
                              </span>
                            ) : (
                              <span className="text-sm font-mono leading-none">
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
                            )}
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
          <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)", background: "#001a00" }}>
            <p className="text-xs font-bold tracking-widest mb-3" style={{ color: "#00ff41" }}>
              LAYER 3 — FINANCIAL HEALTH
            </p>
            <div className="flex gap-6 mb-3">
              <div>
                <p className="text-2xl font-bold font-mono" style={{ color: scoreColor(score?.health_score) }}>
                  {score?.health_passes ?? 0}/{scoredTotal}
                </p>
                <p className="text-[10px] tracking-widest" style={{ color: "rgba(0,255,65,0.35)" }}>CHECKS PASSED</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono" style={{ color: scoreColor(score?.health_score) }}>
                  {score?.health_score != null ? `${Number(score.health_score).toFixed(1)}%` : "—"}
                </p>
                <p className="text-[10px] tracking-widest" style={{ color: "rgba(0,255,65,0.35)" }}>HEALTH SCORE</p>
              </div>
            </div>
            <div className="h-1 rounded-full w-full" style={{ background: "rgba(255,255,255,0.1)" }}>
              <div className="h-full rounded-full" style={{ width: `${score?.health_score ?? 0}%`, background: healthColor(score?.health_score) }} />
            </div>
          </div>

          {healthCats.map((cat, catIdx) => (
            <div
              key={cat.label}
              style={catIdx < healthCats.length - 1 ? { borderBottom: "1px solid rgba(0,255,65,0.1)" } : {}}
            >
              <div className="px-5 pt-4 pb-2">
                <p className="text-xs font-bold tracking-widest" style={{ color: "rgba(0,255,65,0.5)" }}>
                  {cat.label} — {cat.checks.filter((c) => c.pass).length}/{cat.checks.filter((c) => !c.not_scored).length} PASS
                </p>
              </div>
              <div className="px-5 pb-4 space-y-2">
                {cat.checks.length === 0 ? (
                  <p className="text-xs" style={{ color: "rgba(0,255,65,0.25)" }}>No data</p>
                ) : (
                  cat.checks.map((check, i) => {
                    const notScored = check.not_scored === true;
                    const explanation = notScored
                      ? "Not applicable for banks — excluded from health score"
                      : getCheckExplanation(check.name, check.pass);
                    return (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs flex-1 min-w-0 leading-relaxed" style={{ color: "rgba(0,255,65,0.65)" }}>{check.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-mono" style={{ color: "rgba(0,255,65,0.25)" }}>
                              {notScored ? "—" : `${check.years_passed}/5 yrs`}
                            </span>
                            {notScored ? (
                              <span
                                className="inline-block text-center text-[10px] rounded"
                                style={{ padding: "2px 8px", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.3)" }}
                              >
                                NOT SCORED
                              </span>
                            ) : (
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
                            )}
                          </div>
                        </div>
                        {explanation && (
                          <p className="text-[10px] italic" style={{ color: notScored ? "rgba(255,255,255,0.25)" : check.pass ? "rgba(0,255,65,0.5)" : "rgba(255,80,80,0.6)" }}>
                            {explanation}
                          </p>
                        )}
                      </div>
                    );
                  })
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
