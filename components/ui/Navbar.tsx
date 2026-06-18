import { getCachedUser, getCachedUserProfile } from '@/lib/server-auth'
import Link from "next/link";
import NavDropdown from "./NavDropdown";

export default async function Navbar() {
  const user = await getCachedUser()

  let isPro = false
  if (user) {
    const profile = await getCachedUserProfile(user.id)
    const status = profile?.subscription_status ?? 'free'
    isPro = status === 'active' || status === 'trialing'
  }

  return (
    <nav
      className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between shrink-0"
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
            <NavDropdown />
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
            <NavDropdown userEmail={user.email ?? undefined} />
          </>
        )}

        {user && isPro && (
          <>
            <span
              className="tracking-widest text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ background: 'rgba(0,255,65,0.1)', color: '#00ff41', border: '1px solid rgba(0,255,65,0.3)' }}
            >
              PRO
            </span>
            <NavDropdown userEmail={user.email ?? undefined} />
          </>
        )}
      </div>
    </nav>
  );
}
