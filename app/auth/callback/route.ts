import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { sendWelcomeEmail } from "@/lib/emails/welcome";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/screener";

  if (!code) {
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

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Auth callback error:", error.message);
    return redirectFailure;
  }

  // Await the email before redirecting — serverless functions freeze on return,
  // so fire-and-forget promises are killed before the HTTP call completes.
  const userEmail = data.session?.user?.email;
  if (userEmail) {
    try {
      await sendWelcomeEmail(userEmail);
    } catch (err) {
      // Log but don't block the redirect
      console.error("[auth/callback] Welcome email failed:", err);
    }
  }

  return redirectSuccess;
}
