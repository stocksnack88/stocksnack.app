"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ background: "#000", fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", color: "rgba(0,255,65,0.7)" }}>
          <p style={{ fontSize: "12px", letterSpacing: "0.1em" }}>SOMETHING WENT WRONG</p>
          <button
            onClick={reset}
            style={{ marginTop: "1rem", fontSize: "10px", letterSpacing: "0.1em", color: "#00ff41", background: "none", border: "0.5px solid rgba(0,255,65,0.4)", padding: "6px 12px", cursor: "pointer", fontFamily: "monospace" }}
          >
            TRY AGAIN
          </button>
        </div>
      </body>
    </html>
  );
}
