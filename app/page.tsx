import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import Link from "next/link";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/ui/Footer";

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
      <Navbar />

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 gap-12">

        {/* Flow diagram */}
        <div className="w-full max-w-2xl text-xs">
          <div className="flex flex-col sm:flex-row sm:items-stretch gap-3">

            {/* Annual Reports */}
            <div className="flex items-center border border-[#00ff41]/20 rounded px-5 py-4 text-left">
              <div>
                <div className="text-[#00ff41]/80 font-bold tracking-widest mb-1">Annual Reports</div>
                <div className="text-[#00ff41]/30 leading-relaxed">10-Ks, financials,<br />filings</div>
              </div>
            </div>

            {/* → */}
            <div className="flex items-center justify-center text-[#00ff41]/30 text-lg self-center">→</div>

            {/* 3 inputs */}
            <div className="flex flex-col gap-2 flex-1">
              {[
                "1. Price Projection",
                "2. Growth Potential",
                "3. Financial Health Check",
              ].map((label) => (
                <div
                  key={label}
                  className="flex-1 flex items-center border border-[#00ff41]/20 rounded px-4 py-2.5 text-[#00ff41]/70 tracking-wide"
                >
                  {label}
                </div>
              ))}
            </div>

            {/* → */}
            <div className="flex items-center justify-center text-[#00ff41]/30 text-lg self-center">→</div>

            {/* BUY / SELL */}
            <div className="flex flex-col gap-2 font-bold tracking-widest">
              <div className="flex-1 flex items-center justify-center rounded px-6 py-2 bg-[#00ff41]/10 border border-[#00ff41]/30 text-[#00ff41]">
                BUY
              </div>
              <div className="flex-1 flex items-center justify-center rounded px-6 py-2 bg-red-950 border border-red-700/50 text-red-400">
                SELL
              </div>
            </div>
          </div>
        </div>

        {/* Brand + CTA */}
        <div className="flex flex-col items-center text-center gap-6">
          <div>
            <h1 className="text-5xl sm:text-6xl font-bold tracking-[0.15em] text-[#00ff41] leading-tight mb-4">
              STOCK<br />SNACK
            </h1>
            <p className="text-sm text-[#00ff41]/60">
              Backed by 30 financial metrics.
            </p>
          </div>
          <Link
            href="/screener"
            className="px-7 py-3 bg-[#00ff41] text-black font-bold text-sm tracking-widest rounded hover:bg-[#00ff41]/90 transition-colors"
          >
            VIEW SCREENER →
          </Link>
        </div>

      </main>

      <Footer />
    </div>
  );
}
