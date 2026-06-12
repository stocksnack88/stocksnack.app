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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("trial_used, trial_extension_started_at, phone_number, subscription_status")
    .eq("id", user.id)
    .single();

  const isPro =
    profile?.subscription_status === "active" ||
    profile?.subscription_status === "trialing";
  if (isPro) return NextResponse.json({ error: "Already pro" }, { status: 400 });
  if (profile?.trial_used !== true) return NextResponse.json({ error: "Trial not yet expired" }, { status: 400 });
  if (profile?.trial_extension_started_at !== null) return NextResponse.json({ error: "Extension already used" }, { status: 400 });
  if (!profile?.phone_number) return NextResponse.json({ error: "Phone number required" }, { status: 400 });

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("user_profiles")
    .update({ trial_extension_started_at: now })
    .eq("id", user.id);

  return NextResponse.json({ trialExtensionStartedAt: now });
}
