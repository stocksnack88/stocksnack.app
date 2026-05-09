import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import UpgradeButton from "@/components/ui/UpgradeButton";
import ClickableRow from "@/components/ui/ClickableRow";

const FREE_LIMIT = 5;

type ScreenerRow = {
  ticker: string;
  name: string | null;
  sector: string | null;
  ppm_score: number | null;
  growth_score: number | null;
  health_score: number | null;
  final_score: number | null;
  signal: string | null;
  updated_at: string | null;
};

function SignalBadge({ signal }: { signal: string | null }) {
  const s = (signal ?? "").toUpperCase();
  const styles: Record<string, string> = {
    BUY: "bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/60",
    HOLD: "bg-yellow-400/10 text-yellow-300 border border-yellow-400/50",
    SELL: "bg-red-500/10 text-red-400 border border-red-500/50",
  };
  const cls = styles[s] ?? "bg-gray-800 text-gray-400 border border-gray-600";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold tracking-widest ${cls}`}>
      {s || "—"}
    </span>
  );
}

function ScoreCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-600">—</span>;
  const color =
    value >= 70
      ? "text-[#00ff41]"
      : value >= 45
      ? "text-yellow-300"
      : "text-red-400";
  return <span className={`font-mono font-bold ${color}`}>{value.toFixed(1)}</span>;
}

function LockedRow({ ticker }: { ticker: string }) {
  return (
    <tr className="border-t border-[#00ff41]/10 blur-[3px] select-none pointer-events-none">
      <td className="px-4 py-3 font-mono font-bold text-[#00ff41]/40">{ticker}</td>
      <td className="px-4 py-3 text-gray-600">████████████</td>
      <td className="px-4 py-3 text-gray-600">████████</td>
      <td className="px-4 py-3 text-gray-600">██</td>
      <td className="px-4 py-3 text-gray-600">██</td>
      <td className="px-4 py-3 text-gray-600">██</td>
      <td className="px-4 py-3 text-gray-600">██</td>
      <td className="px-4 py-3"><span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-600 border border-gray-700">████</span></td>
    </tr>
  );
}

export default async function ScreenerPage({
  searchParams,
}: {
  searchParams: { upgraded?: string };
}) {
  const justUpgraded = searchParams.upgraded === "1";
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

  const {
    data: { session },
  } = await supabase.auth.getSession();

  let isPro = false;
  if (session?.user?.id) {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("subscription_status")
      .eq("id", session.user.id)
      .single();
    isPro = profile?.subscription_status === "active" || profile?.subscription_status === "trialing";
  }

  const { data: rows, error } = await supabaseAdmin
    .from("stock_scores")
    .select(`
      ticker,
      ppm_score,
      growth_score,
      health_score,
      final_score,
      signal,
      updated_at,
      stocks ( name, sector )
    `)
    .order("final_score", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stocks: ScreenerRow[] = (rows ?? []).map((r: any) => ({
    ticker: r.ticker,
    name: r.stocks?.name ?? null,
    sector: r.stocks?.sector ?? null,
    ppm_score: r.ppm_score,
    growth_score: r.growth_score,
    health_score: r.health_score,
    final_score: r.final_score,
    signal: r.signal,
    updated_at: r.updated_at,
  }));

  const visibleStocks = isPro ? stocks : stocks.slice(0, FREE_LIMIT);
  const lockedStocks = isPro ? [] : stocks.slice(FREE_LIMIT);

  const updatedAt = stocks[0]?.updated_at
    ? new Date(stocks[0].updated_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      })
    : null;

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-red-400 font-mono">Error loading screener data.</p>
      </div>
    );
  }

  return (
    <div className="bg-black text-[#00ff41]" style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}>
      {/* Upgrade success banner */}
      {justUpgraded && (
        <div className="bg-[#00ff41]/10 border-b border-[#00ff41]/30 px-6 py-3 text-center">
          <p className="text-xs text-[#00ff41] font-bold tracking-widest">
            ✓ WELCOME TO PRO — ALL STOCKS ARE NOW UNLOCKED
          </p>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-[#00ff41]/20 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-baseline justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-[0.15em] sm:tracking-[0.3em] text-[#00ff41]">
                STOCK SCREENER
              </h1>
              <p className="mt-1 text-xs text-[#00ff41]/50 tracking-widest">
                BUFFETT-STYLE FUNDAMENTALS · 4-LAYER SCORING MODEL
              </p>
            </div>
            <div className="text-right">
              {updatedAt && (
                <p className="text-xs text-[#00ff41]/40">
                  UPDATED {updatedAt.toUpperCase()}
                </p>
              )}
              <p className="text-xs text-[#00ff41]/40 mt-0.5">
                {isPro ? (
                  <span className="text-[#00ff41]">● PRO · ALL {stocks.length} STOCKS</span>
                ) : (
                  <span className="text-yellow-400/80">◐ FREE · {FREE_LIMIT} OF {stocks.length} STOCKS</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Score key */}
      <div className="px-6 py-3 border-b border-[#00ff41]/10 bg-[#00ff41]/[0.02]">
        <div className="max-w-7xl mx-auto flex gap-6 text-xs text-[#00ff41]/40 flex-wrap">
          <span>SCORES 0–100</span>
          <span className="text-[#00ff41]">■ ≥70 STRONG</span>
          <span className="text-yellow-300">■ 45–69 MODERATE</span>
          <span className="text-red-400">■ &lt;45 WEAK</span>
        </div>
      </div>

      {/* Table */}
      <div className="px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="relative overflow-x-auto rounded border border-[#00ff41]/20">
            <table className="w-full min-w-[640px] text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#00ff41]/30 bg-[#00ff41]/5">
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-widest text-[#00ff41]/70">TICKER</th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-widest text-[#00ff41]/70">COMPANY</th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-widest text-[#00ff41]/70">SECTOR</th>
                  <th className="px-4 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70">PPM</th>
                  <th className="px-4 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70">GROWTH</th>
                  <th className="px-4 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70">HEALTH</th>
                  <th className="px-4 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70">FINAL</th>
                  <th className="px-4 py-3 text-center text-xs font-bold tracking-widest text-[#00ff41]/70">SIGNAL</th>
                </tr>
              </thead>
              <tbody>
                {visibleStocks.map((stock, i) => (
                  <ClickableRow
                    key={stock.ticker}
                    href={`/screener/${stock.ticker}`}
                    className={`border-t border-[#00ff41]/10 transition-colors hover:bg-[#00ff41]/5 ${
                      i % 2 === 1 ? "bg-[#00ff41]/[0.02]" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-[#00ff41] tracking-wider">
                        {stock.ticker}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#00ff41]/80 max-w-[180px] truncate">
                      {stock.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[#00ff41]/50 text-xs tracking-wide">
                      {stock.sector ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ScoreCell value={stock.ppm_score} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ScoreCell value={stock.growth_score} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ScoreCell value={stock.health_score} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ScoreCell value={stock.final_score} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <SignalBadge signal={stock.signal} />
                    </td>
                  </ClickableRow>
                ))}

                {lockedStocks.map((stock) => (
                  <LockedRow key={stock.ticker} ticker={stock.ticker} />
                ))}
              </tbody>
            </table>

            {/* Paywall overlay */}
            {!isPro && lockedStocks.length > 0 && (
              <div className="relative">
                <div className="absolute inset-x-0 -top-32 h-32 bg-gradient-to-b from-transparent to-black/80 pointer-events-none" />
                <div className="border-t border-[#00ff41]/20 bg-black px-6 py-8 text-center">
                  <p className="text-[#00ff41] font-bold tracking-widest text-sm mb-1">
                    {lockedStocks.length} MORE STOCKS LOCKED
                  </p>
                  <p className="text-[#00ff41]/50 text-xs mb-5 tracking-wide">
                    Upgrade to Pro to unlock all {stocks.length} stocks with full scoring data
                  </p>
                  <UpgradeButton />
                  {!session && (
                    <p className="mt-3 text-xs text-[#00ff41]/30">
                      Already have an account?{" "}
                      <a href="/login" className="text-[#00ff41]/60 hover:text-[#00ff41] underline">
                        Sign in
                      </a>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer note */}
          <p className="mt-4 text-xs text-[#00ff41]/20 text-center tracking-wide">
            DATA · FINANCIALMODELINGPREP · SCORES UPDATED WEEKLY
          </p>
        </div>
      </div>
    </div>
  );
}
