import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/screener";

  console.log("[auth/callback] code present:", !!code, "next:", next, "origin:", origin);

  if (!code) {
    console.error("[auth/callback] no code in request");
    return NextResponse.redirect(
      new URL("/login?error=missing_code", origin)
    );
  }

  const redirectSuccess = NextResponse.redirect(new URL(next, origin));
  const redirectFailure = NextResponse.redirect(
    new URL("/login?error=auth_callback_failed", origin)
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            redirectSuccess.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession error:", error.message, error);
    return redirectFailure;
  }

  console.log("[auth/callback] session exchange succeeded");

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  console.log("[auth/callback] getUser:", user?.id ?? null, "error:", userError?.message ?? null);

  if (user) {
    // Start trial on first sign-in (idempotent — skips if trial_used is already true)
    await supabaseAdmin
      .from("user_profiles")
      .update({ trial_used: true, trial_started_at: new Date().toISOString() })
      .eq("id", user.id)
      .eq("trial_used", false);

    // Send welcome email for new users (Google OAuth bypasses signup page)
    // created_at within 60 s means this is a brand-new account
    const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
    const isNewUser = Date.now() - createdAt < 60_000;
    console.log("[auth/callback] isNewUser:", isNewUser, "created_at:", user.created_at);

    if (isNewUser && user.email) {
      fetch(`${origin}/api/send-welcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      }).catch((err) => console.error("[auth/callback] send-welcome failed:", err));
    }
  }

  return redirectSuccess;
}
