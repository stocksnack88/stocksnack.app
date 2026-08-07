import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
import SignOutButton from "@/components/ui/SignOutButton";
import AccountRows from "@/components/ui/AccountRows";

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
      className="w-full max-w-md sm:max-w-lg md:max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-12"
      style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
    >
      <p className="text-xs tracking-[0.3em] mb-3" style={{ color: "rgba(0,255,65,0.35)" }}>
        SETTINGS
      </p>
      <h1 className="text-xl font-bold tracking-widest mb-6" style={{ color: "#00ff41" }}>
        ACCOUNT
      </h1>

      <AccountRows
        email={user.email ?? ""}
        isPro={isPro}
        periodEndStr={periodEndStr}
        cancelAtPeriodEnd={cancelAtPeriodEnd}
        userEmail={user.email ?? ""}
      />

      <p className="text-center mt-8">
        <SignOutButton />
      </p>
    </div>
  );
}
