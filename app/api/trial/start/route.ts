import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
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
    console.log('[/api/trial/start] no authenticated user')
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("user_profiles")
    .select("trial_used, trial_started_at, subscription_status")
    .eq("id", user.id)
    .single();

  console.log('[/api/trial/start] user.id:', user.id)
  console.log('[/api/trial/start] profile:', JSON.stringify(profile))
  console.log('[/api/trial/start] profileError:', profileError?.message ?? null)

  const isPro =
    profile?.subscription_status === "active" ||
    profile?.subscription_status === "trialing";

  console.log('[/api/trial/start] isPro:', isPro, '| trial_used:', profile?.trial_used, '| trial_started_at:', profile?.trial_started_at)

  if (isPro) {
    return NextResponse.json({ error: "Already pro" }, { status: 400 });
  }

  if (profile?.trial_used === true || profile?.trial_started_at !== null) {
    console.log('[/api/trial/start] blocked: trial_used or trial_started_at already set')
    return NextResponse.json({ error: "Trial already used" }, { status: 400 });
  }

  const now = new Date().toISOString();

  await supabaseAdmin
    .from("user_profiles")
    .update({ trial_started_at: now })
    .eq("id", user.id);

  return NextResponse.json({ trialStartedAt: now });
}
