"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://stocksnack.app/auth/callback' },
    });
  }

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

    window.location.href = "/screener";
  }

  return (
    <div className="w-full max-w-sm" style={{ animation: "fadeInUp 400ms ease-out both" }}>
        <form
          onSubmit={handleSubmit}
          className="border border-[#00ff41]/30 rounded p-8 bg-[#00ff41]/[0.02]"
        >
          <h2 className="text-sm font-bold tracking-widest text-[#00ff41]/70 mb-6">
            SIGN IN
          </h2>

          <button
            type="button"
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 border border-[#00ff41]/30 rounded px-4 py-2.5 text-sm text-[#00ff41]/80 hover:border-[#00ff41]/60 hover:text-[#00ff41] transition-colors mb-5"
            style={{ background: 'transparent', fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            CONTINUE WITH GOOGLE
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-[#00ff41]/10" />
            <span className="text-[10px] text-[#00ff41]/25 tracking-widest">OR</span>
            <div className="flex-1 h-px bg-[#00ff41]/10" />
          </div>

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
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black border border-[#00ff41]/30 rounded px-3 py-2.5 text-sm text-[#00ff41] placeholder-[#00ff41]/20 focus:outline-none focus:border-[#00ff41] transition-colors pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#00ff41]/50 hover:text-[#00ff41] transition-colors"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
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
