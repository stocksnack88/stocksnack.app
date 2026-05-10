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
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[500px] flex flex-col items-center gap-4">

          {/* Brand */}
          <h1 className="text-5xl sm:text-6xl font-bold tracking-[0.15em] text-[#00ff41] leading-tight text-center">
            STOCK<br />SNACK
          </h1>
          <p className="text-sm text-[#00ff41]/60 text-center mb-2">
            Backed by 30 financial metrics.
          </p>

          {/* Annual Reports */}
          <div className="w-full border border-[#00ff41]/20 rounded px-5 py-4">
            <div className="text-xs text-[#00ff41]/80 font-bold tracking-widest mb-1">Annual Reports</div>
            <div className="text-xs text-[#00ff41]/30">10-Ks, financials, filings</div>
          </div>

          {/* ↓ */}
          <div className="text-[#00ff41]/30 text-base">↓</div>

          {/* 3 methodology items in one box */}
          <div className="w-full border border-[#00ff41]/20 rounded overflow-hidden text-xs">
            {[
              "1. Price Projection",
              "2. Growth Potential",
              "3. Financial Health Check",
            ].map((label, i) => (
              <div
                key={label}
                className={`px-4 py-3 text-[#00ff41]/70 tracking-wide${i < 2 ? " border-b border-[#00ff41]/10" : ""}`}
              >
                {label}
              </div>
            ))}
          </div>

          {/* ↓ ↓ aligned over BUY / SELL */}
          <div className="w-full flex gap-3 text-[#00ff41]/30 text-base">
            <div className="flex-1 flex justify-center">↓</div>
            <div className="flex-1 flex justify-center">↓</div>
          </div>

          {/* BUY / SELL */}
          <div className="w-full flex gap-3 text-xs font-bold tracking-widest">
            <div className="flex-1 flex items-center justify-center rounded py-3 bg-[#00ff41]/10 border border-[#00ff41]/30 text-[#00ff41]">
              BUY
            </div>
            <div className="flex-1 flex items-center justify-center rounded py-3 bg-red-950 border border-red-700/50 text-red-400">
              SELL
            </div>
          </div>

          {/* CTA */}
          <Link
            href="/screener"
            className="w-full text-center py-3 bg-[#00ff41] text-black font-bold text-sm tracking-widest rounded hover:bg-[#00ff41]/90 transition-colors"
          >
            VIEW SCREENER →
          </Link>

        </div>
      </main>

      <Footer />
    </div>
  );
}
