"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

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

    // Client-side validation
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createBrowserSupabase();
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Tell Supabase where to send the user after email confirmation
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        // Surface Supabase error messages directly — they are user-readable
        setError(authError.message);
        return;
      }

      // Supabase returns an empty identities array when the email already
      // exists (email confirmation enabled). We can't distinguish this from
      // a genuine new signup for security reasons, so show the same message.
      if (data.user && data.user.identities?.length === 0) {
        // Email already registered — treat identically to the new-signup
        // flow so we don't leak whether an email is in the system.
        setCheckEmail(true);
        return;
      }

      // New user — fire welcome email from the client so the browser keeps
      // the fetch alive regardless of confirmation mode or redirect timing.
      if (data.user) {
        fetch("/api/send-welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).catch((err) => console.error("[signup] send-welcome fetch failed:", err));
      }

      // Email confirmation disabled → we get a session immediately
      if (data.session) {
        router.push("/screener");
        router.refresh();
        return;
      }

      // Normal case: email confirmation required
      if (data.user) {
        setCheckEmail(true);
        return;
      }

      // Fallback: something unexpected happened
      setError("Signup failed — please try again.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      console.error("[signup] uncaught exception:", err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="w-full max-w-sm text-center" style={{ animation: "fadeInUp 400ms ease-out both" }}>
          <div className="mb-6 text-3xl" style={{ color: "#00ff41" }}>✓</div>
          <h2
            className="text-sm font-bold tracking-widest mb-3"
            style={{ color: "#00ff41" }}
          >
            CHECK YOUR EMAIL
          </h2>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(0,255,65,0.5)" }}>
            We sent a confirmation link to{" "}
            <span style={{ color: "rgba(0,255,65,0.8)" }}>{email}</span>.
            <br />
            Click the link to activate your account, then{" "}
            <Link
              href="/login"
              className="underline"
              style={{ color: "rgba(0,255,65,0.6)" }}
            >
              sign in
            </Link>
            .
          </p>
          <p className="mt-6 text-xs" style={{ color: "rgba(0,255,65,0.25)" }}>
            Didn&apos;t receive it? Check your spam folder.
          </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm" style={{ animation: "fadeInUp 400ms ease-out both" }}>
        <form
          onSubmit={handleSubmit}
          className="rounded p-8"
          style={{
            border: "1px solid rgba(0,255,65,0.3)",
            background: "rgba(0,255,65,0.02)",
          }}
        >
          <h2
            className="text-sm font-bold tracking-widest mb-6"
            style={{ color: "rgba(0,255,65,0.7)" }}
          >
            CREATE ACCOUNT
          </h2>

          <button
            type="button"
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 rounded px-4 py-2.5 text-sm transition-colors mb-5"
            style={{ border: '1px solid rgba(0,255,65,0.3)', background: 'transparent', color: 'rgba(0,255,65,0.8)', fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,255,65,0.6)'; (e.currentTarget as HTMLButtonElement).style.color = '#00ff41'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,255,65,0.3)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,255,65,0.8)'; }}
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
              <label
                className="block text-xs tracking-widest mb-1.5"
                style={{ color: "rgba(0,255,65,0.5)" }}
              >
                EMAIL
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded px-3 py-2.5 text-sm focus:outline-none transition-colors"
                style={{
                  background: "#000",
                  border: "1px solid rgba(0,255,65,0.3)",
                  color: "#00ff41",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#00ff41")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(0,255,65,0.3)")}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                className="block text-xs tracking-widest mb-1.5"
                style={{ color: "rgba(0,255,65,0.5)" }}
              >
                PASSWORD
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded px-3 py-2.5 text-sm focus:outline-none transition-colors"
                style={{
                  background: "#000",
                  border: "1px solid rgba(0,255,65,0.3)",
                  color: "#00ff41",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#00ff41")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(0,255,65,0.3)")}
                placeholder="Min. 8 characters"
              />
            </div>

            <div>
              <label
                className="block text-xs tracking-widest mb-1.5"
                style={{ color: "rgba(0,255,65,0.5)" }}
              >
                CONFIRM PASSWORD
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded px-3 py-2.5 text-sm focus:outline-none transition-colors"
                style={{
                  background: "#000",
                  border: "1px solid rgba(0,255,65,0.3)",
                  color: "#00ff41",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#00ff41")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(0,255,65,0.3)")}
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Error — inline styles so it renders even if Tailwind class is missing */}
          {error && (
            <div
              className="mt-4 rounded px-3 py-2.5 text-xs tracking-wide"
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.4)",
                color: "#f87171",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full font-bold text-sm tracking-widest py-2.5 rounded transition-colors"
            style={{
              background: loading ? "rgba(0,255,65,0.6)" : "#00ff41",
              color: "#000",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "CREATING ACCOUNT..." : "CREATE ACCOUNT →"}
          </button>
          <p className="mt-3 text-center text-xs font-mono" style={{ color: "rgba(0,255,65,0.3)" }}>
            By signing up you agree to our{" "}
            <a href="/tos" className="underline hover:opacity-70 transition-opacity" style={{ color: "rgba(0,255,65,0.5)" }}>
              Terms of Service
            </a>
            .
          </p>
        </form>

        <p
          className="mt-5 text-center text-xs"
          style={{ color: "rgba(0,255,65,0.3)" }}
        >
          Already have an account?{" "}
          <Link
            href="/login"
            className="underline transition-colors"
            style={{ color: "rgba(0,255,65,0.6)" }}
          >
            Sign in
          </Link>
        </p>
    </div>
  );
}
