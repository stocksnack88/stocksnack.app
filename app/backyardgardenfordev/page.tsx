import Link from 'next/link'

export const metadata = { robots: 'noindex, nofollow' }

const LINKS = [
  { label: 'SCREENER', href: '/screener', desc: 'Full screener with onboarding tour' },
  { label: 'TICKER — NVDA', href: '/screener/NVDA', desc: 'Ticker page (non-dividend stock)' },
  { label: 'TICKER — KO', href: '/screener/KO', desc: 'Ticker page (dividend stock — tests hasDividend gate)' },
  { label: 'BLOG', href: '/blog', desc: 'Blog listing' },
  { label: 'ACCOUNT', href: '/account', desc: 'Account page' },
]

export default function BackyardPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#000', padding: '48px 24px', fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <p style={{ color: 'rgba(0,255,65,0.4)', fontSize: 10, letterSpacing: '0.2em', marginBottom: 8 }}>STOCKSNACK</p>
        <h1 style={{ color: '#00ff41', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>
          BACKYARD DEV
        </h1>
        <p style={{ color: 'rgba(0,255,65,0.5)', fontSize: 12, lineHeight: 1.8, marginBottom: 40 }}>
          This is the internal test entry point for StockSnack.<br />
          Purpose: when the product is live and you need to test a feature, use this page —
          not production. Navigate to the area you want to test, verify it works, then move on.
          This URL is not linked anywhere and is blocked from search engines.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {LINKS.map(({ label, href, desc }) => (
            <Link
              key={href}
              href={href}
              style={{
                display: 'block',
                padding: '14px 16px',
                border: '1px solid rgba(0,255,65,0.15)',
                borderRadius: 4,
                textDecoration: 'none',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              className="backyard-link"
            >
              <p style={{ color: '#00ff41', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 2 }}>{label}</p>
              <p style={{ color: 'rgba(0,255,65,0.4)', fontSize: 10, letterSpacing: '0.05em' }}>{desc}</p>
            </Link>
          ))}
        </div>

        <p style={{ color: 'rgba(0,255,65,0.2)', fontSize: 10, marginTop: 48, letterSpacing: '0.1em' }}>
          stocksnack.app/backyardgardenfordev · noindex
        </p>
      </div>

      <style>{`
        .backyard-link:hover { border-color: rgba(0,255,65,0.4) !important; background: rgba(0,255,65,0.03); }
      `}</style>
    </main>
  )
}
