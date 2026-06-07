"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STORAGE_KEY = "cookie-consent";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  function accept() {
    document.cookie = "cookie-consent=true; path=/; max-age=31536000; SameSite=Lax";
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
    window.dispatchEvent(new Event("cookie-consent-accepted"));
  }

  function decline() {
    localStorage.setItem(STORAGE_KEY, "declined");
    setVisible(false);
    window.dispatchEvent(new Event("cookie-consent-declined"));
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[200] border-t px-5 py-4"
      style={{
        background: "#000",
        borderColor: "rgba(0,255,65,0.18)",
        fontFamily: "var(--font-geist-mono), 'Courier New', monospace",
      }}
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p
          className="text-xs leading-relaxed flex-1"
          style={{ color: "rgba(0,255,65,0.5)" }}
        >
          We use cookies to{" "}
          <strong style={{ color: "rgba(0,255,65,0.75)" }}>improve the product</strong>
          {" "}— including analytics to understand how you use StockSnack so we
          can make it better. By clicking Accept, you agree to our{" "}
          <Link
            href="/privacy"
            className="underline transition-opacity hover:opacity-80"
            style={{ color: "rgba(0,255,65,0.75)" }}
          >
            Privacy Policy
          </Link>
          .
        </p>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={decline}
            className="font-bold text-xs tracking-widest py-2 px-4 rounded transition-colors"
            style={{
              border: "1px solid rgba(0,255,65,0.28)",
              color: "rgba(0,255,65,0.5)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            DECLINE
          </button>
          <button
            onClick={accept}
            className="font-bold text-xs tracking-widest py-2 px-5 rounded transition-colors"
            style={{
              background: "#00ff41",
              color: "#000",
              cursor: "pointer",
            }}
          >
            ACCEPT
          </button>
        </div>
      </div>
    </div>
  );
}
