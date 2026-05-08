import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import Link from "next/link";

export default async function HomePage() {
  // Authenticated users go straight to the screener
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
  const { data: { session } } = await supabase.auth.getSession();
  if (session) redirect("/screener");

  return (
    <div
      className="min-h-screen bg-black flex flex-col"
      style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
    >
      {/* Nav */}
      <nav className="px-6 py-5 flex items-center justify-between border-b border-[#00ff41]/10">
        <span className="text-[#00ff41] font-bold tracking-[0.25em] text-sm">
          STOCKSNACK
        </span>
        <div className="flex items-center gap-6 text-xs">
          <Link
            href="/login"
            className="text-[#00ff41]/50 hover:text-[#00ff41] transition-colors tracking-widest"
          >
            SIGN IN
          </Link>
          <Link
            href="/signup"
            className="px-4 py-1.5 border border-[#00ff41]/40 text-[#00ff41] hover:bg-[#00ff41]/10 transition-colors tracking-widest rounded"
          >
            GET STARTED
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-xs text-[#00ff41]/40 tracking-[0.4em] mb-6">
          BUFFETT-STYLE STOCK SCREENER
        </p>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-[0.15em] text-[#00ff41] mb-6 leading-tight">
          STOCK<br />SNACK
        </h1>

        <p className="text-sm text-[#00ff41]/60 max-w-sm leading-relaxed mb-10">
          Four-layer fundamental scoring model — valuation, growth, financial
          health, and Buffett-tier quality — ranked weekly across 20 large-cap
          stocks.
        </p>

        {/* Score preview chips */}
        <div className="flex flex-wrap justify-center gap-3 mb-12 text-xs">
          {[
            { label: "PPM", sub: "Price Projection" },
            { label: "GROWTH", sub: "Revenue & FCF" },
            { label: "HEALTH", sub: "24 Checks" },
            { label: "FINAL", sub: "BUY · HOLD · SELL" },
          ].map(({ label, sub }) => (
            <div
              key={label}
              className="border border-[#00ff41]/20 rounded px-3 py-2 text-left"
            >
              <div className="text-[#00ff41] font-bold tracking-widest">{label}</div>
              <div className="text-[#00ff41]/30 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/screener"
            className="px-7 py-3 bg-[#00ff41] text-black font-bold text-sm tracking-widest rounded hover:bg-[#00ff41]/90 transition-colors"
          >
            VIEW SCREENER →
          </Link>
          <Link
            href="/signup"
            className="px-7 py-3 border border-[#00ff41]/30 text-[#00ff41]/70 font-bold text-sm tracking-widest rounded hover:border-[#00ff41]/60 hover:text-[#00ff41] transition-colors"
          >
            CREATE FREE ACCOUNT
          </Link>
        </div>

        <p className="mt-6 text-xs text-[#00ff41]/25 tracking-wide">
          5 stocks free · all 20 with Pro · $20/mo
        </p>
      </main>

      {/* Footer */}
      <footer className="px-6 py-5 border-t border-[#00ff41]/10 text-center">
        <p className="text-xs text-[#00ff41]/20 tracking-widest">
          DATA · FINANCIALMODELINGPREP · SCORES UPDATED WEEKLY
        </p>
      </footer>
    </div>
  );
}
