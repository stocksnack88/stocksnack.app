import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasInternalAccess } from "@/lib/internal-access";

export async function middleware(request: NextRequest) {
  // @supabase/ssr requires threading the response object through setAll so
  // token-refresh cookies written by Supabase propagate to the browser.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates the JWT server-side on every call — more secure than
  // getSession() which trusts the locally-stored session without revalidation.
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Resolve preview access before React starts streaming. Doing this in
  // middleware produces a real HTTP redirect instead of briefly rendering the
  // not-found fallback while the dashboard layout redirects.
  if (process.env.VERCEL_ENV === "preview" && pathname.startsWith("/screener")) {
    if (!user) return NextResponse.redirect(new URL("/login", request.url));
    if (!hasInternalAccess(user.email)) {
      return NextResponse.redirect(new URL("/preview-access-denied", request.url));
    }
  }

  // Redirect already-authenticated users away from auth pages.
  if (user && (pathname.startsWith("/login") || pathname.startsWith("/signup"))) {
    return NextResponse.redirect(new URL("/screener", request.url));
  }

  // Must return supabaseResponse (not a fresh NextResponse.next()) so that
  // any auth-refresh cookies set in setAll() reach the browser.
  return supabaseResponse;
}

export const config = {
  matcher: ["/login", "/signup", "/screener/:path*", "/watchlist/:path*", "/profile/:path*"],
};
