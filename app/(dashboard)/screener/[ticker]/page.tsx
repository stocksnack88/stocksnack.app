import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";
import UpgradeButton from "@/components/ui/UpgradeButton";

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

function fmtMktCap(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function fmtCagr(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(1)}%`;
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

  const [stockRes, priceRes, scoreRes] = await Promise.all([
    supabaseAdmin.from("stocks").select("*").eq("ticker", ticker).single(),
    supabaseAdmin.from("stock_prices").select("*").eq("ticker", ticker).single(),
    supabaseAdmin.from("stock_scores").select("*").eq("ticker", ticker).single(),
  ]);

  if (stockRes.error && scoreRes.error) return notFound();

  const stock = stockRes.data;
  const price = priceRes.data;
  const score = scoreRes.data;
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
  const upside =
    currentPrice && blendedPrice
      ? ((blendedPrice - currentPrice) / currentPrice) * 100
      : null;

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
          {currentPrice && (
            <div className="text-right">
              <p className="text-2xl font-bold font-mono" style={{ color: "#00ff41" }}>
                ${currentPrice.toFixed(2)}
              </p>
              <p className="text-xs mt-0.5 tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>
                CURRENT PRICE
              </p>
            </div>
          )}
        </div>

        {/* Price stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "MARKET CAP", value: fmtMktCap(price?.market_cap) },
            { label: "52W HIGH", value: price?.week_52_high ? `$${Number(price.week_52_high).toFixed(2)}` : "—" },
            { label: "52W LOW", value: price?.week_52_low ? `$${Number(price.week_52_low).toFixed(2)}` : "—" },
            { label: "BETA", value: price?.beta ? Number(price.beta).toFixed(2) : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded px-4 py-3" style={card}>
              <p className="text-xs tracking-widest mb-1" style={{ color: "rgba(0,255,65,0.4)" }}>{label}</p>
              <p className="text-sm font-bold" style={{ color: "#00ff41" }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Description */}
        {stock?.description && (
          <p
            className="text-xs leading-relaxed border-l-2 pl-4"
            style={{ color: "rgba(0,255,65,0.4)", borderColor: "rgba(0,255,65,0.2)" }}
          >
            {stock.description.length > 320
              ? stock.description.slice(0, 320) + "..."
              : stock.description}
          </p>
        )}

        {/* ── Score summary ────────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-bold tracking-widest mb-3" style={{ color: "rgba(0,255,65,0.5)" }}>
            SCORE SUMMARY
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "PPM", value: score?.ppm_score, sub: "Price Projection" },
              { label: "GROWTH", value: score?.growth_score, sub: "Revenue & FCF" },
              { label: "HEALTH", value: score?.health_score, sub: `${score?.health_passes ?? 0}/24 Checks` },
              { label: "FINAL", value: score?.final_score, sub: score?.signal ?? "—" },
            ].map(({ label, value, sub }) => {
              const c = scoreColor(value);
              return (
                <div key={label} className="rounded px-4 py-4 text-center" style={card}>
                  <p className="text-xs tracking-widest mb-2" style={{ color: "rgba(0,255,65,0.4)" }}>{label}</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: c }}>
                    {value !== null && value !== undefined ? Number(value).toFixed(1) : "—"}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "rgba(0,255,65,0.3)" }}>{sub}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Layer 1: PPM ─────────────────────────────────────────────────────── */}
        <section className="rounded overflow-hidden" style={card}>
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
            <div>
              <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>
                LAYER 1 — PRICE PROJECTION MODEL
              </p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(0,255,65,0.4)" }}>
                Blended fair value from 3 independent methods · 5-year horizon
              </p>
            </div>
            <ScoreBar value={score?.ppm_score} />
          </div>
          <div className="px-5 py-5 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            {[
              { label: "M1 · EBITDA MULTIPLE", value: score?.ppm_m1_price ? `$${Number(score.ppm_m1_price).toFixed(2)}` : "—" },
              { label: "M2 · FCF YIELD", value: score?.ppm_m2_price ? `$${Number(score.ppm_m2_price).toFixed(2)}` : "—" },
              { label: "M3 · TOTAL RETURN", value: score?.ppm_m3_price ? `$${Number(score.ppm_m3_price).toFixed(2)}` : "—" },
              { label: "BLENDED FAIR VALUE", value: blendedPrice ? `$${blendedPrice.toFixed(2)}` : "—" },
              { label: "CURRENT PRICE", value: currentPrice ? `$${currentPrice.toFixed(2)}` : "—" },
              {
                label: "UPSIDE / DOWNSIDE",
                value: upside !== null ? `${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%` : "—",
                highlight: upside !== null ? (upside >= 10 ? "#00ff41" : upside < 0 ? "#f87171" : "#fbbf24") : undefined,
              },
            ].map(({ label, value, highlight }) => (
              <div key={label}>
                <p className="text-xs tracking-widest mb-1" style={{ color: "rgba(0,255,65,0.4)" }}>{label}</p>
                <p className="text-sm font-bold font-mono" style={{ color: highlight ?? "#00ff41" }}>{value}</p>
              </div>
            ))}
          </div>
          {score?.ppm_cagr !== null && score?.ppm_cagr !== undefined && (
            <div className="px-5 py-3" style={{ borderTop: "1px solid rgba(0,255,65,0.1)" }}>
              <p className="text-xs" style={{ color: "rgba(0,255,65,0.4)" }}>
                IMPLIED 5-YEAR CAGR TO FAIR VALUE{" "}
                <span className="font-bold" style={{ color: "#00ff41" }}>
                  {fmtCagr(score.ppm_cagr)}
                </span>
              </p>
            </div>
          )}
        </section>

        {/* ── Layer 2: Growth ──────────────────────────────────────────────────── */}
        <section className="rounded overflow-hidden" style={card}>
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
            <div>
              <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>
                LAYER 2 — GROWTH
              </p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(0,255,65,0.4)" }}>
                Compound annual growth rates — revenue, net income & free cash flow
              </p>
            </div>
            <ScoreBar value={score?.growth_score} />
          </div>
          <div className="px-5 py-4">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left pb-3 text-xs tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>METRIC</th>
                  <th className="text-right pb-3 text-xs tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>3-YEAR CAGR</th>
                  <th className="text-right pb-3 text-xs tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>5-YEAR CAGR</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Revenue", c3: score?.revenue_cagr_3y, c5: score?.revenue_cagr_5y },
                  { label: "Net Income", c3: score?.net_income_cagr_3y, c5: score?.net_income_cagr_5y },
                  { label: "Free Cash Flow", c3: score?.fcf_cagr_3y, c5: score?.fcf_cagr_5y },
                ].map(({ label, c3, c5 }, i, arr) => (
                  <tr key={label} style={i < arr.length - 1 ? { borderBottom: "1px solid rgba(0,255,65,0.08)" } : {}}>
                    <td className="py-3" style={{ color: "rgba(0,255,65,0.7)" }}>{label}</td>
                    <td className="py-3 text-right font-mono font-bold" style={{ color: c3 != null ? (Number(c3) >= 0 ? "#00ff41" : "#f87171") : "rgba(0,255,65,0.3)" }}>
                      {fmtCagr(c3)}
                    </td>
                    <td className="py-3 text-right font-mono font-bold" style={{ color: c5 != null ? (Number(c5) >= 0 ? "#00ff41" : "#f87171") : "rgba(0,255,65,0.3)" }}>
                      {fmtCagr(c5)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Layer 3: Health — 24 checks ──────────────────────────────────────── */}
        <section className="rounded overflow-hidden" style={card}>
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
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
                    <div key={i} className="flex items-center justify-between gap-4">
                      <span className="text-xs" style={{ color: "rgba(0,255,65,0.65)" }}>{check.name}</span>
                      <div className="flex items-center gap-3 shrink-0">
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
          <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
            <p className="text-xs font-bold tracking-widest" style={{ color: "#00ff41" }}>
              LAYER 4 — FINAL SCORE
            </p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(0,255,65,0.4)" }}>
              PPM 40% · Growth 30% · Health 30%
            </p>
          </div>
          <div className="px-5 py-6 flex flex-wrap items-center gap-8">
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
