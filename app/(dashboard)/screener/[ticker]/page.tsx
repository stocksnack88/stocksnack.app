import { notFound } from "next/navigation";
import { COVERED_STOCK_COUNT } from "@/lib/constants";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";
import UpgradeButton from "@/components/ui/UpgradeButton";
import BackButton from "@/components/ui/BackButton";
import { getDailyFreeTickers } from "@/lib/free-stocks";
import TickerPageContent from "./TickerPageContent";

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
    .select("ticker, signal")
    .order("final_score", { ascending: false });
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
      .select("fiscal_year,revenue,gross_profit,ebitda,free_cash_flow,gross_margin,operating_income,net_income,eps,total_assets,total_debt,total_equity,cash_and_equivalents,operating_cash_flow,capex,dividends_paid,buybacks,net_margin,roe,roic,debt_to_equity,interest_coverage,market_cap_at_year,sga,rd_expense,tax_rate,sbc,shares_outstanding,intangibles,preferred_stock,retained_earnings")
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
            Upgrade to Pro to unlock all {COVERED_STOCK_COUNT} stocks with full breakdowns.
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

  return (
    <TickerPageContent
      ticker={ticker}
      stock={stock}
      price={price}
      score={score}
      fundamentals={fundamentals}
      healthCats={healthCats}
      scoredTotal={scoredTotal}
    />
  );
}
