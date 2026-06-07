import Link from "next/link";

export default function Footer() {
  return (
    <footer
      className="px-6 py-5 border-t"
      style={{ borderColor: "rgba(0,255,65,0.1)", fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs tracking-widest">
        <p style={{ color: "rgba(0,255,65,0.2)" }}>© {new Date().getFullYear()} STOCKSNACK</p>
        <p className="text-center" style={{ color: "rgba(0,255,65,0.15)" }}>
          NOT FINANCIAL ADVICE · FOR INFORMATIONAL PURPOSES ONLY
        </p>
        <div className="flex gap-5">
          <Link
            href="/tos"
            className="transition-opacity hover:opacity-70"
            style={{ color: "rgba(0,255,65,0.25)" }}
          >
            TERMS
          </Link>
          <Link
            href="/privacy"
            className="transition-opacity hover:opacity-70"
            style={{ color: "rgba(0,255,65,0.25)" }}
          >
            PRIVACY
          </Link>
        </div>
      </div>
    </footer>
  );
}
