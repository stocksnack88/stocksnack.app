import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const origin = request.nextUrl.origin;

  // Read session from cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const userId = session.user.id;
  const userEmail = session.user.email ?? "";

  // Get or create Stripe customer
  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("stripe_customer_id, subscription_status")
    .eq("id", userId)
    .single();

  // Already active — send straight to screener
  if (
    profile?.subscription_status === "active" ||
    profile?.subscription_status === "trialing"
  ) {
    return NextResponse.redirect(new URL("/screener", request.url));
  }

  let customerId = profile?.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: { supabase_user_id: userId },
    });
    customerId = customer.id;

    await supabaseAdmin
      .from("user_profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", userId);
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "StockSnack Pro" },
          unit_amount: 2000, // $20.00
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/screener?upgraded=1`,
    cancel_url: `${origin}/screener`,
    metadata: { supabase_user_id: userId },
    subscription_data: {
      metadata: { supabase_user_id: userId },
    },
  });

  return NextResponse.redirect(checkoutSession.url!);
}
