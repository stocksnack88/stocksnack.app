"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createBrowserSupabase();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/screener");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
        <form
          onSubmit={handleSubmit}
          className="border border-[#00ff41]/30 rounded p-8 bg-[#00ff41]/[0.02]"
        >
          <h2 className="text-sm font-bold tracking-widest text-[#00ff41]/70 mb-6">
            SIGN IN
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[#00ff41]/50 tracking-widest mb-1.5">
                EMAIL
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black border border-[#00ff41]/30 rounded px-3 py-2.5 text-sm text-[#00ff41] placeholder-[#00ff41]/20 focus:outline-none focus:border-[#00ff41] transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-[#00ff41]/50 tracking-widest">
                  PASSWORD
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-[#00ff41]/40 hover:text-[#00ff41]/70 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-[#00ff41]/30 rounded px-3 py-2.5 text-sm text-[#00ff41] placeholder-[#00ff41]/20 focus:outline-none focus:border-[#00ff41] transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <p className="mt-4 text-xs text-red-400 tracking-wide">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full bg-[#00ff41] text-black font-bold text-sm tracking-widest py-2.5 rounded hover:bg-[#00ff41]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "SIGNING IN..." : "SIGN IN →"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-[#00ff41]/30">
          No account?{" "}
          <Link
            href="/signup"
            className="text-[#00ff41]/60 hover:text-[#00ff41] underline transition-colors"
          >
            Create one free
          </Link>
        </p>
    </div>
  );
}
