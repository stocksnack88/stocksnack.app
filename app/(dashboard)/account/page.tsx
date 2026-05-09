import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";
import CancelSubscriptionButton from "@/components/ui/CancelSubscriptionButton";
import Link from "next/link";

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

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
    const subs = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "active",
      limit: 1,
    });
    if (subs.data.length > 0) {
      periodEnd = subs.data[0].current_period_end;
      cancelAtPeriodEnd = subs.data[0].cancel_at_period_end;
    }
  }

  const periodEndStr = periodEnd ? fmt(periodEnd) : null;

  const row = "rgba(0,255,65,0.06)";
  const border = "rgba(0,255,65,0.12)";

  return (
    <div
      className="max-w-xl mx-auto px-6 py-12"
      style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
    >
      <p className="text-xs tracking-[0.3em] mb-3" style={{ color: "rgba(0,255,65,0.35)" }}>
        SETTINGS
      </p>
      <h1 className="text-xl font-bold tracking-widest mb-8" style={{ color: "#00ff41" }}>
        ACCOUNT
      </h1>

      {/* Profile */}
      <div className="rounded mb-6 overflow-hidden" style={{ border: `1px solid ${border}` }}>
        <div className="px-5 py-3" style={{ background: "rgba(0,255,65,0.04)", borderBottom: `1px solid ${border}` }}>
          <p className="text-xs font-bold tracking-widest" style={{ color: "rgba(0,255,65,0.5)" }}>PROFILE</p>
        </div>
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: row }}>
          <p className="text-xs tracking-widest" style={{ color: "rgba(0,255,65,0.45)" }}>EMAIL</p>
          <p className="text-xs" style={{ color: "rgba(0,255,65,0.8)" }}>{user.email}</p>
        </div>
      </div>

      {/* Plan */}
      <div className="rounded mb-6 overflow-hidden" style={{ border: `1px solid ${border}` }}>
        <div className="px-5 py-3" style={{ background: "rgba(0,255,65,0.04)", borderBottom: `1px solid ${border}` }}>
          <p className="text-xs font-bold tracking-widest" style={{ color: "rgba(0,255,65,0.5)" }}>SUBSCRIPTION</p>
        </div>

        <div className="px-5 py-4 flex items-center justify-between" style={{ background: row, borderBottom: `1px solid ${border}` }}>
          <p className="text-xs tracking-widest" style={{ color: "rgba(0,255,65,0.45)" }}>PLAN</p>
          <span
            className="text-xs font-bold tracking-widest px-2.5 py-1 rounded"
            style={
              isPro
                ? { background: "rgba(0,255,65,0.12)", color: "#00ff41" }
                : { background: "rgba(0,255,65,0.05)", color: "rgba(0,255,65,0.4)" }
            }
          >
            {isPro ? "PRO" : "FREE"}
          </span>
        </div>

        {isPro && periodEndStr && (
          <div className="px-5 py-4 flex items-center justify-between" style={{ background: row, borderBottom: `1px solid ${border}` }}>
            <p className="text-xs tracking-widest" style={{ color: "rgba(0,255,65,0.45)" }}>
              {cancelAtPeriodEnd ? "ACCESS UNTIL" : "NEXT BILLING"}
            </p>
            <p className="text-xs" style={{ color: cancelAtPeriodEnd ? "#f87171" : "rgba(0,255,65,0.7)" }}>
              {periodEndStr}
            </p>
          </div>
        )}

        {isPro && (
          <div className="px-5 py-5" style={{ background: "rgba(0,255,65,0.02)" }}>
            {cancelAtPeriodEnd ? (
              <div
                className="rounded px-4 py-3 text-xs leading-relaxed"
                style={{
                  border: "1px solid rgba(239,68,68,0.3)",
                  background: "rgba(239,68,68,0.05)",
                  color: "#f87171",
                }}
              >
                Your subscription is scheduled to cancel on{" "}
                <strong>{periodEndStr}</strong>. You&apos;ll keep Pro access until then.
              </div>
            ) : (
              <CancelSubscriptionButton periodEnd={periodEndStr ?? ""} />
            )}
          </div>
        )}

        {!isPro && (
          <div className="px-5 py-5" style={{ background: "rgba(0,255,65,0.02)" }}>
            <Link
              href="/api/subscribe"
              className="inline-block font-bold text-xs tracking-widest py-2.5 px-6 rounded transition-colors"
              style={{ background: "#00ff41", color: "#000" }}
            >
              UPGRADE TO PRO →
            </Link>
            <p className="mt-2 text-xs" style={{ color: "rgba(0,255,65,0.3)" }}>
              $20/mo · all 20 stocks · full detail pages
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
