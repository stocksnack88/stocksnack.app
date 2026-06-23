"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { playClick, playChime } from "@/lib/sounds";

const STORAGE_KEY = "ss_newsletter_dismissed";

export default function NewsletterPopup() {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    // Show after 20s or after 40% scroll — whichever comes first
    const show = () => {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    };

    timerRef.current = setTimeout(show, 20000);

    const onScroll = () => {
      const scrolled = window.scrollY / (document.body.scrollHeight - window.innerHeight);
      if (scrolled >= 0.4) show();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const dismiss = () => {
    playClick();
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setErrorMsg("");

    const { error } = await createBrowserSupabase()
      .from("newsletter_subscribers")
      .insert({ email: email.trim().toLowerCase(), source: "blog" });

    if (error) {
      if (error.code === "23505") {
        setStatus("success");
        playChime();
        localStorage.setItem(STORAGE_KEY, "1");
      } else {
        setStatus("error");
        setErrorMsg("Something went wrong. Try again.");
      }
    } else {
      setStatus("success");
      playChime();
      localStorage.setItem(STORAGE_KEY, "1");
    }
  };

  if (!visible) return null;

  const mono = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: "0 0 32px",
        ...mono,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        style={{
          background: "#0a0a0a",
          border: "1px solid rgba(0,255,65,0.3)",
          width: "100%",
          maxWidth: "440px",
          padding: "28px 24px 24px",
          position: "relative",
        }}
      >
        {/* Close */}
        <button
          onClick={dismiss}
          style={{
            position: "absolute",
            top: 12,
            right: 14,
            background: "none",
            border: "none",
            color: "rgba(0,255,65,0.4)",
            fontSize: 18,
            cursor: "pointer",
            lineHeight: 1,
          }}
          aria-label="Close"
        >
          ✕
        </button>

        {status === "success" ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ color: "#00ff41", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>
              YOU&apos;RE IN
            </div>
            <div style={{ color: "rgba(0,255,65,0.6)", fontSize: 12 }}>
              We&apos;ll send stock deep-dives straight to your inbox.
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "inline-block",
                background: "#00ff41",
                color: "#000",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                padding: "2px 8px",
                marginBottom: 12,
              }}
            >
              FREE WEEKLY PICKS
            </div>

            <p style={{ color: "rgba(0,255,65,0.85)", fontSize: 13, marginBottom: 4, fontWeight: 700 }}>
              Get stock deep-dives in your inbox.
            </p>
            <p style={{ color: "rgba(0,255,65,0.45)", fontSize: 11, marginBottom: 20, lineHeight: 1.6 }}>
              No noise. Just data-driven analysis on stocks worth watching, every week.
            </p>

            <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
              <input
                type="email"
                required
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  flex: 1,
                  background: "rgba(0,255,65,0.05)",
                  border: "1px solid rgba(0,255,65,0.2)",
                  color: "#00ff41",
                  fontSize: 12,
                  padding: "8px 12px",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <button
                type="submit"
                disabled={status === "loading"}
                style={{
                  background: "#00ff41",
                  color: "#000",
                  border: "none",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  padding: "8px 14px",
                  cursor: "pointer",
                  opacity: status === "loading" ? 0.6 : 1,
                  fontFamily: "inherit",
                }}
              >
                {status === "loading" ? "..." : "SUBSCRIBE"}
              </button>
            </form>

            {status === "error" && (
              <p style={{ color: "rgba(255,80,80,0.8)", fontSize: 11, marginTop: 8 }}>{errorMsg}</p>
            )}

            <button
              onClick={dismiss}
              style={{
                background: "none",
                border: "none",
                color: "rgba(0,255,65,0.3)",
                fontSize: 10,
                marginTop: 14,
                cursor: "pointer",
                padding: 0,
                fontFamily: "inherit",
                letterSpacing: "0.05em",
              }}
            >
              No thanks
            </button>
          </>
        )}
      </div>
    </div>
  );
}
