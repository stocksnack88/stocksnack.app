import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import Link from "next/link";
import SignOutButton from "./SignOutButton";

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
  const email = user?.email ?? null;

  return (
    <nav
      className="px-6 py-4 flex items-center justify-between shrink-0"
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

      <div className="flex items-center gap-5 text-xs">
        <Link
          href="/pricing"
          className="tracking-widest transition-colors text-[#00ff41]/40 hover:text-[#00ff41] hidden sm:block"
        >
          PRICING
        </Link>
        {email ? (
          <>
            <Link
              href="/account"
              className="hidden sm:block tracking-wide max-w-[200px] truncate transition-colors hover:text-[#00ff41]/70"
              style={{ color: "rgba(0,255,65,0.35)" }}
            >
              {email}
            </Link>
            <Link
              href="/account"
              className="tracking-widest transition-colors text-[#00ff41]/40 hover:text-[#00ff41]"
            >
              ACCOUNT
            </Link>
            <SignOutButton />
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="tracking-widest transition-colors text-[#00ff41]/50 hover:text-[#00ff41]"
            >
              SIGN IN
            </Link>
            <Link
              href="/signup"
              className="px-4 py-1.5 rounded text-xs tracking-widest transition-colors border border-[#00ff41]/40 text-[#00ff41] hover:bg-[#00ff41]/10"
            >
              GET STARTED
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
