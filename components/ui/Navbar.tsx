import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";

export default async function Navbar() {
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

  let isPro = false;
  if (user) {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("subscription_status")
      .eq("id", user.id)
      .single();
    const status = profile?.subscription_status ?? "free";
    isPro = status === "active" || status === "trialing";
  }

  return (
    <nav
      className="sticky top-0 z-50 h-16 px-6 py-4 flex items-center justify-between shrink-0"
      style={{
        fontFamily: "var(--font-geist-mono), 'Courier New', monospace",
        borderBottom: "1px solid rgba(0,255,65,0.15)",
        background: "#000",
      }}
    >
      <Link
        href="/"
        className="font-bold text-sm tracking-[0.25em] transition-colors"
        style={{ color: "#00ff41" }}
      >
        STOCKSNACK
      </Link>

      <div className="flex items-center gap-3 sm:gap-5 text-xs">
        {!user && (
          <>
            <Link
              href="/pricing"
              className="tracking-widest transition-colors text-[#00ff41]/40 hover:text-[#00ff41]"
            >
              PRICING
            </Link>
            <Link
              href="/login"
              className="tracking-widest transition-colors text-[#00ff41]/50 hover:text-[#00ff41] py-3 px-2"
            >
              SIGN IN
            </Link>
          </>
        )}

        {user && !isPro && (
          <>
            <Link
              href="/pricing"
              className="px-4 py-1.5 rounded tracking-widest font-bold transition-colors bg-[#00ff41] text-black hover:bg-[#00ff41]/90"
            >
              UPGRADE
            </Link>
            <Link
              href="/account"
              className="tracking-widest transition-colors text-[#00ff41]/40 hover:text-[#00ff41]"
            >
              ACCOUNT
            </Link>
          </>
        )}

        {user && isPro && (
          <Link
            href="/account"
            className="tracking-widest transition-colors text-[#00ff41]/40 hover:text-[#00ff41]"
          >
            ACCOUNT
          </Link>
        )}
      </div>
    </nav>
  );
}
