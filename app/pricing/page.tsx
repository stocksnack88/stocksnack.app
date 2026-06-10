import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";

const font = "var(--font-geist-mono), 'Courier New', monospace";
const bV   = "0.5px solid rgba(0,255,65,0.1)";   // vertical column dividers
const bH   = "0.5px solid rgba(0,255,65,0.08)";  // horizontal row dividers

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

  const rows: { label: string; free: string; freeColor: string; freeBold?: boolean; pro: string; proColor: string }[] = [
    { label: "Stocks access",           free: "5 random", freeColor: "rgba(255,255,255,0.3)",  pro: "S&P 500", proColor: "rgba(0,255,65,0.8)"  },
    { label: "Filter function",         free: "✕",        freeColor: "rgba(255,80,80,0.55)",   freeBold: true, pro: "✓", proColor: "#00ff41", },
    { label: "Price Projection Model",   free: "5 only",   freeColor: "rgba(255,255,255,0.25)", pro: "All",     proColor: "rgba(0,255,65,0.8)"  },
    { label: "Growth Quality",           free: "5 only",   freeColor: "rgba(255,255,255,0.25)", pro: "All",     proColor: "rgba(0,255,65,0.8)"  },
    { label: "Financial Health",         free: "5 only",   freeColor: "rgba(255,255,255,0.25)", pro: "All",     proColor: "rgba(0,255,65,0.8)"  },
    { label: "Stock Ranking",            free: "5 only",   freeColor: "rgba(255,255,255,0.25)", pro: "All",     proColor: "rgba(0,255,65,0.8)"  },
    { label: "Score detail",            free: "5 only",   freeColor: "rgba(255,255,255,0.25)", pro: "All",     proColor: "rgba(0,255,65,0.8)"  },
    { label: "P/E Ratio Analysis",      free: "✕",        freeColor: "rgba(255,80,80,0.55)",   freeBold: true, pro: "All",     proColor: "rgba(0,255,65,0.8)"  },
  ];

  const ctaBase: React.CSSProperties = {
    display: "inline-block", padding: "5px 10px", borderRadius: "4px",
    fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
    fontFamily: font, textDecoration: "none",
  };

  const ctaCurrent: React.CSSProperties = {
    ...ctaBase, border: "0.5px solid rgba(0,255,65,0.25)", color: "rgba(0,255,65,0.4)",
  };

  const ctaCurrentFree: React.CSSProperties = {
    ...ctaBase, border: "0.5px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.3)",
  };

  const annualCell: React.CSSProperties = {
    background: "rgba(0,255,65,0.06)",
  };
  const annualGlow = "0 0 20px rgba(0,255,65,0.08)";

  return (
    <div style={{ background: "#000", fontFamily: font, minHeight: "100vh", paddingRight: "12px" }}>

      {/* Table — no header, starts immediately */}
      <div style={{ maxWidth: "480px", margin: "0 auto", padding: "2rem 1rem 2rem" }}>
        <div style={{ border: "0.5px solid rgba(0,255,65,0.25)", borderRadius: "12px", overflow: "visible", padding: "4px" }}>
          <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontFamily: font }}>
            <colgroup>
              <col style={{ width: "36%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "22%" }} />
            </colgroup>

            {/* Header row — plan names, single line each */}
            <thead>
              <tr style={{ background: "#0a0a0a", borderBottom: "0.5px solid rgba(0,255,65,0.15)" }}>
                <th style={{ padding: "8px 6px" }} />
                <th style={{ padding: "8px 6px", borderLeft: bV, textAlign: "center" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.35)" }}>FREE</span>
                </th>
                <th style={{ padding: "8px 6px", borderLeft: bV, textAlign: "center", lineHeight: 1.1 }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", color: "rgba(0,255,65,0.7)", display: "block", margin: 0 }}>PRO MONTHLY</span>
                </th>
                <th style={{ padding: "8px 6px", textAlign: "center", lineHeight: 1.1, ...annualCell, borderRadius: "8px 8px 0 0", boxShadow: annualGlow }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", color: "#00ff41", display: "block", margin: 0 }}>PRO ANNUAL</span>
                </th>
              </tr>
            </thead>

            {/* Feature rows */}
            <tbody>
              {/* Price row (index 0 — transparent) */}
              <tr style={{ background: "transparent", borderBottom: bH }}>
                <td style={{ padding: "10px 8px", fontSize: "12px", color: "rgba(255,255,255,0.45)", wordBreak: "break-word" }}>Price</td>
                <td style={{ padding: "10px 4px", fontSize: "11px", textAlign: "center", borderLeft: bV, color: "rgba(255,255,255,0.4)" }}>$0 / free</td>
                <td style={{ padding: "10px 4px", fontSize: "11px", textAlign: "center", borderLeft: bV, color: "rgba(0,255,65,0.7)" }}>$40 / mo</td>
                <td style={{ padding: "10px 4px", fontSize: "11px", textAlign: "center", color: "#00ff41", ...annualCell, boxShadow: annualGlow }}>
                  $20 / mo<br />
                  <span style={{ fontSize: "9px", fontStyle: "italic", opacity: 0.5 }}>($240/yr)</span>
                </td>
              </tr>
              {rows.map((row, i) => (
                <tr key={row.label} style={{ background: (i + 1) % 2 === 1 ? "rgba(0,255,65,0.018)" : "transparent", borderBottom: bH }}>
                  <td style={{ padding: "10px 8px", fontSize: "11px", color: "rgba(255,255,255,0.45)", wordBreak: "break-word" }}>
                    {row.label}
                  </td>
                  <td style={{ padding: "10px 4px", fontSize: "11px", textAlign: "center", borderLeft: bV, color: row.freeColor, fontWeight: row.freeBold ? 700 : 400 }}>
                    {row.free}
                  </td>
                  <td colSpan={2} style={{ padding: "10px 4px", fontSize: "11px", textAlign: "center", borderLeft: bV, color: row.proColor, fontWeight: 700 }}>
                    {row.pro}
                  </td>
                </tr>
              ))}
            </tbody>

            {/* CTA row */}
            <tfoot>
              <tr style={{ background: "#080808", borderTop: "0.5px solid rgba(0,255,65,0.12)" }}>
                <td style={{ padding: "12px 8px" }} />

                {/* FREE — CURRENT PLAN if logged in, trial link if not */}
                <td style={{ padding: "8px 6px", textAlign: "center", borderLeft: bV }}>
                  {isLoggedIn ? (
                    <span style={ctaCurrentFree}>CURRENT PLAN</span>
                  ) : (
                    <span style={{ display: "block", lineHeight: 0.85, margin: 0 }}>
                      <a href="/signup" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", color: "rgba(0,255,65,0.4)", fontFamily: font, textDecoration: "none", lineHeight: 1.1 }}>
                        5-min free trial →
                      </a>
                    </span>
                  )}
                </td>

                {/* PRO MONTHLY */}
                <td style={{ padding: "12px 8px", textAlign: "center", borderLeft: bV }}>
                  {isPro ? (
                    <span style={ctaCurrent}>CURRENT PLAN</span>
                  ) : (
                    <a href="/api/subscribe?plan=monthly" style={{ ...ctaBase, border: "0.5px solid rgba(0,255,65,0.5)", color: "rgba(0,255,65,0.8)" }}>
                      UPGRADE →
                    </a>
                  )}
                </td>

                {/* PRO ANNUAL */}
                <td style={{ padding: "12px 8px", textAlign: "center", ...annualCell, borderRadius: "0 0 8px 8px", boxShadow: annualGlow }}>
                  {isPro ? (
                    <span style={ctaCurrent}>CURRENT PLAN</span>
                  ) : (
                    <a href="/api/subscribe?plan=annual" style={{ ...ctaBase, background: "#00ff41", color: "#000" }}>
                      UPGRADE →
                    </a>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p style={{ textAlign: "center", marginTop: "1rem", fontSize: "11px", color: "rgba(0,255,65,0.2)", fontFamily: font }}>
          Cancel anytime. No hidden fees.
        </p>
        <p style={{ textAlign: "center", marginTop: "0.5rem", fontSize: "10px", color: "rgba(0,255,65,0.18)", fontFamily: font }}>
          By upgrading you agree to our{" "}
          <Link href="/tos" style={{ color: "rgba(0,255,65,0.35)", textDecoration: "underline" }}>
            Terms of Service
          </Link>
          .
        </p>
      </div>

    </div>
  );
}
