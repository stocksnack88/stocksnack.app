import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";

const mono = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" };

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

  const borderCol = "1px solid rgba(0,255,65,0.1)";
  const borderRow = "1px solid rgba(0,255,65,0.08)";
  const annualBg  = { background: "rgba(0,255,65,0.03)" };

  function FeatureCell({ value, type }: { value: string; type: "dim" | "green" | "check" | "x" }) {
    const style =
      type === "check" ? { color: "#00ff41" } :
      type === "x"     ? { color: "rgba(255,80,80,0.6)" } :
      type === "green" ? { color: "rgba(0,255,65,0.8)" } :
                         { color: "rgba(0,255,65,0.3)" };
    return (
      <span className={`text-[11px]${type === "check" || type === "x" ? " font-bold text-sm" : type === "green" ? " font-bold" : ""}`} style={style}>
        {value}
      </span>
    );
  }

  const rows: { label: string; free: string; freeType: "dim" | "green" | "check" | "x"; pro: string; proType: "dim" | "green" | "check" | "x" }[] = [
    { label: "Stocks access",          free: "5 random daily",  freeType: "dim",   pro: "Full S&P 500",  proType: "green" },
    { label: "Filter function",        free: "✕",               freeType: "x",     pro: "✓",             proType: "check" },
    { label: "All 4 scoring layers",   free: "5 stocks only",   freeType: "dim",   pro: "All stocks",    proType: "green" },
    { label: "Signal (BUY+/HOLD/SELL)",free: "5 stocks only",   freeType: "dim",   pro: "All stocks",    proType: "green" },
    { label: "Score detail",           free: "5 stocks only",   freeType: "dim",   pro: "All stocks",    proType: "green" },
  ];

  return (
    <div className="bg-black" style={mono}>

      {/* Header */}
      <div className="text-center py-16 px-6">
        <p className="text-xs tracking-[0.4em] mb-4" style={{ color: "rgba(0,255,65,0.35)" }}>
          PRICING
        </p>
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight sm:tracking-[0.15em] mb-5" style={{ color: "#00ff41" }}>
          SIMPLE, TRANSPARENT PLANS
        </h1>
        <p className="text-sm max-w-sm mx-auto leading-relaxed" style={{ color: "rgba(0,255,65,0.5)" }}>
          Fundamental scoring built for long-term investors.
          Start free, upgrade when you&apos;re ready.
        </p>
      </div>

      {/* Comparison table */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(0,255,65,0.15)" }}>
          <table className="w-full border-collapse min-w-[540px]">
            <colgroup>
              <col style={{ width: "34%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "22%" }} />
            </colgroup>

            {/* Column headers */}
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(0,255,65,0.15)" }}>
                <th className="px-5 py-6" />

                {/* FREE */}
                <th className="px-5 py-6 text-center align-top" style={{ borderLeft: borderCol }}>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[11px] font-bold tracking-[0.2em]" style={{ color: "rgba(0,255,65,0.45)" }}>FREE</span>
                    <span className="text-2xl font-bold" style={{ color: "#00ff41" }}>$0</span>
                    <span className="text-[11px]" style={{ color: "rgba(0,255,65,0.3)" }}>forever free</span>
                  </div>
                </th>

                {/* PRO MONTHLY */}
                <th className="px-5 py-6 text-center align-top" style={{ borderLeft: borderCol }}>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[11px] font-bold tracking-[0.2em]" style={{ color: "rgba(0,255,65,0.7)" }}>PRO MONTHLY</span>
                    <span className="text-2xl font-bold" style={{ color: "#00ff41" }}>$40</span>
                    <span className="text-[11px]" style={{ color: "rgba(0,255,65,0.4)" }}>per month</span>
                  </div>
                </th>

                {/* PRO ANNUAL */}
                <th className="px-5 py-6 text-center align-top" style={{ borderLeft: borderCol, ...annualBg }}>
                  <div className="flex flex-col items-center gap-1">
                    <span className="mb-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest" style={{ background: "#00ff41", color: "#000" }}>
                      BEST VALUE
                    </span>
                    <span className="text-[11px] font-bold tracking-[0.2em]" style={{ color: "#00ff41" }}>PRO ANNUAL</span>
                    <span className="text-2xl font-bold" style={{ color: "#00ff41" }}>$20</span>
                    <span className="text-[11px]" style={{ color: "rgba(0,255,65,0.5)" }}>per month</span>
                    <span className="text-[11px]" style={{ color: "rgba(0,255,65,0.35)" }}>billed $240/year</span>
                  </div>
                </th>
              </tr>
            </thead>

            {/* Feature rows */}
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.label} style={{ borderBottom: i < rows.length - 1 ? borderRow : "1px solid rgba(0,255,65,0.15)" }}>
                  <td className="px-5 py-4 text-[11px] tracking-wide" style={{ color: "rgba(0,255,65,0.5)" }}>
                    {row.label}
                  </td>
                  <td className="px-5 py-4 text-center" style={{ borderLeft: borderCol }}>
                    <FeatureCell value={row.free} type={row.freeType} />
                  </td>
                  <td className="px-5 py-4 text-center" style={{ borderLeft: borderCol }}>
                    <FeatureCell value={row.pro} type={row.proType} />
                  </td>
                  <td className="px-5 py-4 text-center" style={{ borderLeft: borderCol, ...annualBg }}>
                    <FeatureCell value={row.pro} type={row.proType} />
                  </td>
                </tr>
              ))}
            </tbody>

            {/* CTA row */}
            <tfoot>
              <tr>
                <td className="px-5 py-6" />

                {/* FREE — always static */}
                <td className="px-5 py-6 text-center" style={{ borderLeft: borderCol }}>
                  <span
                    className="inline-block px-4 py-2 rounded text-[11px] font-bold tracking-widest"
                    style={{ border: "1px solid rgba(0,255,65,0.18)", color: "rgba(0,255,65,0.35)" }}
                  >
                    CURRENT PLAN
                  </span>
                </td>

                {/* PRO MONTHLY */}
                <td className="px-5 py-6 text-center" style={{ borderLeft: borderCol }}>
                  {isPro ? (
                    <span
                      className="inline-block px-4 py-2 rounded text-[11px] font-bold tracking-widest"
                      style={{ border: "1px solid rgba(0,255,65,0.3)", color: "rgba(0,255,65,0.5)" }}
                    >
                      CURRENT PLAN
                    </span>
                  ) : (
                    <a
                      href="/api/subscribe?plan=monthly"
                      className="inline-block px-4 py-2 rounded text-[11px] font-bold tracking-widest transition-colors"
                      style={{ border: "1px solid rgba(0,255,65,0.5)", color: "rgba(0,255,65,0.8)" }}
                    >
                      UPGRADE →
                    </a>
                  )}
                </td>

                {/* PRO ANNUAL */}
                <td className="px-5 py-6 text-center" style={{ borderLeft: borderCol, ...annualBg }}>
                  {isPro ? (
                    <span
                      className="inline-block px-4 py-2 rounded text-[11px] font-bold tracking-widest"
                      style={{ border: "1px solid rgba(0,255,65,0.3)", color: "rgba(0,255,65,0.5)" }}
                    >
                      CURRENT PLAN
                    </span>
                  ) : (
                    <a
                      href="/api/subscribe?plan=annual"
                      className="inline-block px-4 py-2 rounded text-[11px] font-bold tracking-widest transition-colors"
                      style={{ background: "#00ff41", color: "#000" }}
                    >
                      UPGRADE →
                    </a>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: "rgba(0,255,65,0.25)" }}>
          Cancel anytime. No hidden fees.
        </p>
        <p className="mt-2 text-center text-xs" style={{ color: "rgba(0,255,65,0.2)" }}>
          By upgrading you agree to our{" "}
          <Link href="/tos" className="underline hover:opacity-70 transition-opacity" style={{ color: "rgba(0,255,65,0.4)" }}>
            Terms of Service
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
