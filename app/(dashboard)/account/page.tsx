import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
import CancelSubscriptionButton from "@/components/ui/CancelSubscriptionButton";
import SignOutButton from "@/components/ui/SignOutButton";
import AccountClientActions from "@/components/ui/AccountClientActions";
import Link from "next/link";

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const DIM = "rgba(0,255,65,0.45)";
const DIVIDER = "rgba(0,255,65,0.08)";

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: "bold",
  letterSpacing: "0.2em",
  color: "rgba(0,255,65,0.35)",
  margin: "18px 0 4px",
};

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "9px 0",
  borderBottom: `1px solid ${DIVIDER}`,
  fontSize: 12,
};

export default async function AccountPage() {
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("stripe_customer_id, subscription_status")
    .eq("id", user.id)
    .single();

  const status = profile?.subscription_status ?? "free";
  const isPro = status === "active" || status === "trialing";

  // Fetch live subscription details from Stripe if Pro
  let periodEnd: number | null = null;
  let cancelAtPeriodEnd = false;

  if (isPro && profile?.stripe_customer_id) {
    try {
      const subs = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: "active",
        limit: 1,
        expand: ["data.latest_invoice"],
      });
      if (subs.data.length > 0) {
        const sub = subs.data[0];
        cancelAtPeriodEnd = sub.cancel_at_period_end;
        const inv = sub.latest_invoice as Stripe.Invoice | null;
        periodEnd = inv?.period_end ?? null;
      }
    } catch (err) {
      console.error("[account] Stripe subscriptions.list failed:", err);
    }
  }

  const periodEndStr = periodEnd ? fmt(periodEnd) : null;

  return (
    <div
      className="max-w-md mx-auto px-6 py-12"
      style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
    >
      <p className="text-xs tracking-[0.3em] mb-3" style={{ color: "rgba(0,255,65,0.35)" }}>
        SETTINGS
      </p>
      <h1 className="text-xl font-bold tracking-widest mb-6" style={{ color: "#00ff41" }}>
        ACCOUNT
      </h1>

      {/* Install app -- up top, above everything else, so it's the first
          thing anyone lands on this page sees rather than buried below
          billing/preferences. */}
      <div
        className="rounded mb-6"
        style={{
          border: "1px solid rgba(0,255,65,0.2)",
          background: "rgba(0,255,65,0.02)",
          padding: "14px 16px",
          animation: "fadeInUp 300ms ease-out 50ms both",
        }}
      >
        <p className="text-xs font-bold tracking-widest mb-1" style={{ color: "#00ff41" }}>
          📲 INSTALL THE APP
        </p>
        <p className="text-[10px] leading-relaxed mb-2.5" style={{ color: "rgba(0,255,65,0.45)" }}>
          One tap from your home screen, no browser bar, stays in sync automatically.
        </p>
        <div className="flex justify-between items-baseline py-1.5" style={{ borderTop: `1px solid ${DIVIDER}` }}>
          <span className="text-[10px] flex-shrink-0" style={{ color: DIM }}>IPHONE</span>
          <span className="text-xs text-right">Share icon &rarr; <strong>Add to Home Screen</strong></span>
        </div>
        <div className="flex justify-between items-baseline py-1.5" style={{ borderTop: `1px solid ${DIVIDER}` }}>
          <span className="text-[10px] flex-shrink-0" style={{ color: DIM }}>ANDROID</span>
          <span className="text-xs text-right">&#8942; menu &rarr; <strong>Install app</strong></span>
        </div>
      </div>

      {/* Dense fact table -- one hairline row per item, label left / value
          right, instead of a boxy card per section. */}
      <div style={{ animation: "fadeInUp 300ms ease-out 100ms both" }}>
        <p style={{ ...sectionLabel, marginTop: 0 }}>PROFILE</p>
        <div style={row}>
          <span style={{ color: DIM }}>EMAIL</span>
          <span className="truncate max-w-[60%]" style={{ color: "rgba(0,255,65,0.85)" }}>{user.email}</span>
        </div>

        <p style={sectionLabel}>SUBSCRIPTION</p>
        <div style={row}>
          <span style={{ color: DIM }}>PLAN</span>
          <span
            className="text-[10px] font-bold tracking-widest px-2 py-0.5 rounded"
            style={
              isPro
                ? { background: "rgba(0,255,65,0.12)", color: "#00ff41" }
                : { background: "rgba(0,255,65,0.05)", color: "rgba(0,255,65,0.4)" }
            }
          >
            {isPro ? "PRO" : "FREE"}
          </span>
        </div>

        {isPro && periodEndStr && !cancelAtPeriodEnd && (
          <div style={row}>
            <span style={{ color: DIM }}>NEXT BILLING</span>
            <span style={{ color: "rgba(0,255,65,0.85)" }}>{periodEndStr}</span>
          </div>
        )}

        {isPro && (
          <div style={{ ...row, borderBottom: cancelAtPeriodEnd || !periodEndStr ? row.borderBottom : "none", flexWrap: "wrap" }}>
            {cancelAtPeriodEnd && periodEndStr ? (
              <div
                className="w-full rounded px-3 py-2.5 text-xs leading-relaxed"
                style={{
                  border: "1px solid rgba(239,68,68,0.3)",
                  background: "rgba(239,68,68,0.05)",
                  color: "#f87171",
                }}
              >
                Scheduled to cancel on <strong>{periodEndStr}</strong>. You&apos;ll keep Pro access until then.
              </div>
            ) : (
              <>
                <span style={{ color: DIM }}>MANAGE</span>
                <CancelSubscriptionButton periodEnd={periodEndStr ?? ""} />
              </>
            )}
          </div>
        )}

        {!isPro && (
          <div style={{ ...row, flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
            <Link
              href="/api/subscribe"
              className="inline-block font-bold text-xs tracking-widest py-2 px-5 rounded transition-colors"
              style={{ background: "#00ff41", color: "#000" }}
            >
              UPGRADE TO PRO &rarr;
            </Link>
            <p className="text-[10px]" style={{ color: "rgba(0,255,65,0.3)" }}>
              $20/mo &middot; all 20 stocks &middot; full detail pages
            </p>
          </div>
        )}

        <AccountClientActions userEmail={user.email ?? ""} sectionLabel={sectionLabel} rowStyle={row} dim={DIM} />
      </div>

      <p className="text-center mt-8">
        <SignOutButton />
      </p>
    </div>
  );
}
