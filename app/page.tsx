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
      <main className="flex-1 flex flex-col items-center justify-start md:justify-center px-6 pt-8 pb-12 md:py-12">
        <div className="w-full max-w-[500px] flex flex-col items-center gap-6 md:gap-12">

          {/* Block A: Brand */}
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="text-5xl md:text-6xl font-bold tracking-[0.15em] text-[#00ff41] leading-none md:leading-tight">
              STOCK<br />SNACK
            </h1>
            <p className="text-sm text-[#00ff41]/60">
              Backed by 30 financial metrics.
            </p>
          </div>

          {/* Block B: Methodology flow — 60% wide, centred, compact */}
          <div className="w-full flex flex-col items-center gap-1.5">

            <div className="w-3/5 border border-[#00ff41]/20 rounded px-2 py-1 md:px-4 md:py-2 text-center">
              <div className="text-xs text-[#00ff41]/80 font-bold tracking-widest mb-0.5">Annual Reports</div>
              <div className="text-xs text-[#00ff41]/30">10-Ks, financials, filings</div>
            </div>

            <div className="text-[#00ff41]/30 text-sm leading-none">⬇</div>

            <div className="w-3/5 border border-[#00ff41]/20 rounded overflow-hidden text-xs">
              {[
                "1. Price Projection",
                "2. Growth Potential",
                "3. Financial Health Check",
              ].map((label, i) => (
                <div
                  key={label}
                  className={`px-2 py-1 md:px-3 md:py-1.5 text-[#00ff41]/70 tracking-wide text-center${i < 2 ? " border-b border-[#00ff41]/10" : ""}`}
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="text-[#00ff41]/30 text-sm leading-none">⬇</div>

            {/* Merged BUY / or / SELL */}
            <div className="w-3/5 flex rounded overflow-hidden text-xs font-bold tracking-widest border border-[#00ff41]/15">
              <div className="flex-1 flex items-center justify-center py-2.5 bg-[#00ff41]/10 text-[#00ff41]">
                BUY
              </div>
              <div
                className="w-8 shrink-0 flex items-center justify-center text-[10px] font-normal tracking-normal text-neutral-500"
                style={{ background: "linear-gradient(to right, rgba(0,255,65,0.1), rgb(69,10,10))" }}
              >
                or
              </div>
              <div className="flex-1 flex items-center justify-center py-2.5 bg-red-950 text-red-400">
                SELL
              </div>
            </div>

          </div>

          {/* Block C: CTA */}
          <Link
            href="/screener"
            className="w-full text-center py-5 bg-[#00ff41] text-black font-bold text-lg tracking-widest rounded hover:bg-[#00ff41]/90 transition-colors mt-6 md:mt-0"
          >
            VIEW SCREENER →
          </Link>

        </div>
      </main>

      <Footer />
    </div>
  );
}
