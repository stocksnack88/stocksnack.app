import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center"
      style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
    >
      <p
        className="text-xs tracking-[0.4em] mb-5"
        style={{ color: "rgba(0,255,65,0.25)" }}
      >
        404
      </p>
      <h1
        className="text-2xl font-bold tracking-widest mb-4"
        style={{ color: "#00ff41" }}
      >
        PAGE NOT FOUND
      </h1>
      <p
        className="text-xs leading-relaxed mb-10 max-w-xs"
        style={{ color: "rgba(0,255,65,0.4)" }}
      >
        This page doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="font-bold text-xs tracking-widest py-2.5 px-6 rounded transition-colors"
        style={{ background: "#00ff41", color: "#000" }}
      >
        ← BACK TO HOME
      </Link>
    </div>
  );
}
