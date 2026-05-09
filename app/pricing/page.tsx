import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";

const mono = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" };

function Check({ ok }: { ok: boolean }) {
  return (
    <span
      className="shrink-0 text-xs font-bold w-4"
      style={{ color: ok ? "#00ff41" : "rgba(0,255,65,0.2)" }}
    >
      {ok ? "✓" : "—"}
    </span>
  );
}

function Feature({ label, ok = true }: { label: string; ok?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      <Check ok={ok} />
      <span
        className="text-xs leading-relaxed"
        style={{ color: ok ? "rgba(0,255,65,0.7)" : "rgba(0,255,65,0.25)" }}
      >
        {label}
      </span>
    </li>
  );
}

export default async function PricingPage() {
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

  const isLoggedIn = !!session;

  return (
    <div className="bg-black" style={mono}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="text-center py-16 px-6">
        <p
          className="text-xs tracking-[0.4em] mb-4"
          style={{ color: "rgba(0,255,65,0.35)" }}
        >
          PRICING
        </p>
        <h1
          className="text-xl sm:text-3xl font-bold tracking-tight sm:tracking-[0.15em] mb-5"
          style={{ color: "#00ff41" }}
        >
          SIMPLE, TRANSPARENT PLANS
        </h1>
        <p
          className="text-sm max-w-sm mx-auto leading-relaxed"
          style={{ color: "rgba(0,255,65,0.5)" }}
        >
          Fundamental scoring built for long-term investors.
          Start free, upgrade when you&apos;re ready.
        </p>
      </div>

      {/* ── Tier cards ─────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

          {/* ── FREE ─────────────────────────────────────────────────────── */}
          <div
            className="rounded-lg p-7 flex flex-col"
            style={{
              border: "1px solid rgba(0,255,65,0.15)",
              background: "rgba(0,255,65,0.01)",
            }}
          >
            <div className="mb-6">
              <p
                className="text-xs font-bold tracking-widest mb-3"
                style={{ color: "rgba(0,255,65,0.4)" }}
              >
                FREE
              </p>
              <div className="flex items-baseline gap-1 mb-1">
                <span
                  className="text-3xl font-bold"
                  style={{ color: "#00ff41" }}
                >
                  $0
                </span>
                <span
                  className="text-xs"
                  style={{ color: "rgba(0,255,65,0.35)" }}
                >
                  / month
                </span>
              </div>
              <p
                className="text-xs"
                style={{ color: "rgba(0,255,65,0.3)" }}
              >
                No credit card required
              </p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              <Feature label="5 top-ranked stocks" />
              <Feature label="Screener table view" />
              <Feature label="Final score & signal" />
              <Feature label="Full detail pages" ok={false} />
              <Feature label="PPM fair value breakdown" ok={false} />
              <Feature label="24-check health analysis" ok={false} />
              <Feature label="Growth CAGR metrics" ok={false} />
              <Feature label="Email alerts" ok={false} />
            </ul>

            {isLoggedIn && !isPro ? (
              <div
                className="w-full text-center py-2.5 rounded text-xs font-bold tracking-widest"
                style={{
                  border: "1px solid rgba(0,255,65,0.3)",
                  color: "rgba(0,255,65,0.5)",
                }}
              >
                CURRENT PLAN
              </div>
            ) : (
              <Link
                href="/signup"
                className="w-full text-center block py-2.5 rounded text-xs font-bold tracking-widest transition-colors"
                style={{
                  border: "1px solid rgba(0,255,65,0.25)",
                  color: "rgba(0,255,65,0.6)",
                }}
              >
                GET STARTED FREE
              </Link>
            )}
          </div>

          {/* ── PRO (featured) ───────────────────────────────────────────── */}
          <div
            className="rounded-lg p-7 flex flex-col relative"
            style={{
              border: "1px solid rgba(0,255,65,0.7)",
              background: "rgba(0,255,65,0.04)",
            }}
          >
            {/* Most popular badge */}
            <div
              className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold tracking-widest"
              style={{
                background: "#00ff41",
                color: "#000",
              }}
            >
              MOST POPULAR
            </div>

            <div className="mb-6 mt-2">
              <p
                className="text-xs font-bold tracking-widest mb-3"
                style={{ color: "#00ff41" }}
              >
                PRO
              </p>
              <div className="flex items-baseline gap-1 mb-1">
                <span
                  className="text-3xl font-bold"
                  style={{ color: "#00ff41" }}
                >
                  $20
                </span>
                <span
                  className="text-xs"
                  style={{ color: "rgba(0,255,65,0.5)" }}
                >
                  / month
                </span>
              </div>
              <p
                className="text-xs"
                style={{ color: "rgba(0,255,65,0.35)" }}
              >
                Cancel anytime
              </p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              <Feature label="All 20 stocks" />
              <Feature label="Full detail pages" />
              <Feature label="PPM fair value breakdown" />
              <Feature label="24-check health analysis" />
              <Feature label="Growth CAGR metrics" />
              <Feature label="Weekly score updates" />
              <Feature label="4-layer scoring breakdown" />
              <Feature label="Email alerts" ok={false} />
            </ul>

            {isPro ? (
              <div
                className="w-full text-center py-2.5 rounded text-xs font-bold tracking-widest"
                style={{
                  border: "1px solid rgba(0,255,65,0.5)",
                  color: "rgba(0,255,65,0.6)",
                }}
              >
                CURRENT PLAN
              </div>
            ) : (
              <Link
                href="/api/subscribe"
                className="w-full text-center block py-2.5 rounded text-xs font-bold tracking-widest transition-colors"
                style={{
                  background: "#00ff41",
                  color: "#000",
                }}
              >
                UPGRADE TO PRO →
              </Link>
            )}
          </div>

          {/* ── PRO PLUS ─────────────────────────────────────────────────── */}
          <div
            className="rounded-lg p-7 flex flex-col relative"
            style={{
              border: "1px solid rgba(0,255,65,0.25)",
              background: "rgba(0,255,65,0.02)",
            }}
          >
            {/* Coming soon badge */}
            <div
              className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold tracking-widest whitespace-nowrap"
              style={{
                border: "1px solid rgba(0,255,65,0.3)",
                color: "rgba(0,255,65,0.5)",
                background: "#000",
              }}
            >
              COMING SOON
            </div>

            <div className="mb-6 mt-2">
              <p
                className="text-xs font-bold tracking-widest mb-3"
                style={{ color: "rgba(0,255,65,0.6)" }}
              >
                PRO PLUS
              </p>
              <div className="flex items-baseline gap-1 mb-1">
                <span
                  className="text-3xl font-bold"
                  style={{ color: "rgba(0,255,65,0.7)" }}
                >
                  $35
                </span>
                <span
                  className="text-xs"
                  style={{ color: "rgba(0,255,65,0.3)" }}
                >
                  / month
                </span>
              </div>
              <p
                className="text-xs"
                style={{ color: "rgba(0,255,65,0.25)" }}
              >
                Cancel anytime
              </p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              <Feature label="Everything in Pro" />
              <Feature label="Email alerts for new BUY signals" />
              <Feature label="Score change notifications" />
              <Feature label="Priority updates (before weekly batch)" />
              <Feature label="Early access to new features" />
              <Feature label="Dedicated support" />
            </ul>

            <button
              disabled
              className="w-full text-center py-2.5 rounded text-xs font-bold tracking-widest cursor-not-allowed"
              style={{
                border: "1px solid rgba(0,255,65,0.15)",
                color: "rgba(0,255,65,0.25)",
              }}
            >
              JOIN WAITLIST →
            </button>
          </div>

        </div>

        {/* ── Feature comparison footnote ──────────────────────────────────── */}
        <div
          className="mt-14 rounded-lg px-6 py-5"
          style={{
            border: "1px solid rgba(0,255,65,0.1)",
            background: "rgba(0,255,65,0.01)",
          }}
        >
          <p
            className="text-xs font-bold tracking-widest mb-4"
            style={{ color: "rgba(0,255,65,0.4)" }}
          >
            HOW SCORES ARE CALCULATED
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "LAYER 1 · PPM", desc: "Blended fair value from 3 valuation methods" },
              { label: "LAYER 2 · GROWTH", desc: "3Y & 5Y CAGRs for revenue, net income, FCF" },
              { label: "LAYER 3 · HEALTH", desc: "24 Buffett-style pass/fail checks" },
              { label: "LAYER 4 · FINAL", desc: "PPM 40% · Growth 30% · Health 30%" },
            ].map(({ label, desc }) => (
              <div key={label}>
                <p
                  className="text-xs font-bold tracking-widest mb-1"
                  style={{ color: "rgba(0,255,65,0.5)" }}
                >
                  {label}
                </p>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "rgba(0,255,65,0.3)" }}
                >
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer note ──────────────────────────────────────────────────── */}
        <p
          className="mt-10 text-center text-xs tracking-wide"
          style={{ color: "rgba(0,255,65,0.2)" }}
        >
          DATA · FINANCIALMODELINGPREP · SCORES UPDATED WEEKLY · PRICES IN USD
        </p>
      </div>
    </div>
  );
}
