'use client'
import Link from "next/link";
import { usePathname } from "next/navigation";
import { playClick } from "@/lib/sounds";

const MONO: React.CSSProperties = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" };

const ITEMS = [
  { href: "/screener", label: "SCREENER" },
  { href: "/market", label: "MARKET" },
  { href: "/account", label: "ACCOUNT" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[900] flex md:hidden"
      style={{
        ...MONO,
        background: "#000",
        borderTop: "1px solid rgba(0,255,65,0.15)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => playClick()}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-6 transition-colors"
            style={{ color: active ? "#00ff41" : "rgba(0,255,65,0.4)" }}
          >
            <span className="text-[11px] tracking-[0.1em]" style={{ fontWeight: 700 }}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
