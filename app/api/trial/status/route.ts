import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const response = NextResponse.next();

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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log('[/api/trial/status] no authenticated user')
    return NextResponse.json({ isPro: false, trialUsed: true, trialStartedAt: null });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("user_profiles")
    .select("subscription_status, trial_used, trial_started_at")
    .eq("id", user.id)
    .single();

  console.log('[/api/trial/status] user.id:', user.id)
  console.log('[/api/trial/status] profile:', JSON.stringify(profile))
  console.log('[/api/trial/status] profileError:', profileError?.message ?? null)

  const status = profile?.subscription_status ?? "free";
  const isPro = status === "active" || status === "trialing";
  const payload = {
    isPro,
    trialUsed: profile?.trial_used ?? true,
    trialStartedAt: profile?.trial_started_at ?? null,
  }
  console.log('[/api/trial/status] returning:', JSON.stringify(payload))

  return NextResponse.json(payload);
}
