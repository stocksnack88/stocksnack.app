export const metadata = {
  title: "Privacy Policy — StockSnack",
};

const h = "text-xs font-bold tracking-widest mt-10 mb-3";
const body = "text-xs leading-relaxed";
const dim = "rgba(0,255,65,0.45)";
const dimmer = "rgba(0,255,65,0.28)";
const accent = "rgba(0,255,65,0.7)";

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <p className="text-xs tracking-[0.3em] mb-3" style={{ color: "rgba(0,255,65,0.35)" }}>
        LEGAL
      </p>
      <h1 className="text-2xl font-bold tracking-widest mb-2" style={{ color: "#00ff41" }}>
        PRIVACY POLICY
      </h1>
      <p className="text-xs mb-8" style={{ color: dimmer }}>
        Effective date: May 9, 2026
      </p>

      <p className={body} style={{ color: dim }}>
        StockSnack (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) respects your
        privacy. This policy explains what information we collect, how we use it, and your
        rights regarding that information when you use stocksnack.app (the
        &ldquo;Service&rdquo;).
      </p>

      {/* 1 */}
      <p className={h} style={{ color: accent }}>1. INFORMATION WE COLLECT</p>
      <p className="text-xs font-bold tracking-widest mb-2" style={{ color: "rgba(0,255,65,0.55)" }}>
        Information you provide
      </p>
      <ul className={`${body} space-y-2 pl-4`} style={{ color: dim }}>
        <li style={{ listStyleType: "disc" }}>
          <strong style={{ color: "rgba(0,255,65,0.6)" }}>Email address</strong> — collected
          when you create an account or contact us.
        </li>
        <li style={{ listStyleType: "disc" }}>
          <strong style={{ color: "rgba(0,255,65,0.6)" }}>Payment information</strong> — if
          you subscribe to a paid plan, your payment details (card number, billing address) are
          collected and processed directly by Stripe. We receive only a payment token and
          subscription status; we never store your full card details.
        </li>
      </ul>

      <p className="text-xs font-bold tracking-widest mt-5 mb-2" style={{ color: "rgba(0,255,65,0.55)" }}>
        Information collected automatically
      </p>
      <ul className={`${body} space-y-2 pl-4`} style={{ color: dim }}>
        <li style={{ listStyleType: "disc" }}>
          <strong style={{ color: "rgba(0,255,65,0.6)" }}>Usage data</strong> — pages visited,
          features used, and general interaction patterns, collected to improve the Service.
        </li>
        <li style={{ listStyleType: "disc" }}>
          <strong style={{ color: "rgba(0,255,65,0.6)" }}>Log data</strong> — server logs may
          include your IP address, browser type, and timestamps for security and debugging
          purposes. Logs are retained for a limited period.
        </li>
        <li style={{ listStyleType: "disc" }}>
          <strong style={{ color: "rgba(0,255,65,0.6)" }}>Cookies and session tokens</strong> —
          we use session cookies managed by Supabase to keep you authenticated. These are
          strictly necessary for the Service to function.
        </li>
      </ul>

      {/* 2 */}
      <p className={h} style={{ color: accent }}>2. HOW WE USE YOUR INFORMATION</p>
      <ul className={`${body} space-y-2 pl-4`} style={{ color: dim }}>
        <li style={{ listStyleType: "disc" }}>To create and manage your account.</li>
        <li style={{ listStyleType: "disc" }}>To process subscription payments and send receipts.</li>
        <li style={{ listStyleType: "disc" }}>
          To send transactional emails (account confirmation, password reset, billing notices).
        </li>
        <li style={{ listStyleType: "disc" }}>To respond to support requests.</li>
        <li style={{ listStyleType: "disc" }}>
          To monitor and improve the security and performance of the Service.
        </li>
        <li style={{ listStyleType: "disc" }}>
          To comply with legal obligations.
        </li>
      </ul>
      <p className={`${body} mt-3`} style={{ color: dim }}>
        We do not use your information for advertising, and we do not sell your personal data
        to third parties.
      </p>

      {/* 3 */}
      <p className={h} style={{ color: accent }}>3. THIRD-PARTY SERVICES</p>
      <p className={body} style={{ color: dim }}>
        We rely on the following trusted third-party providers to operate the Service. Each
        operates under its own privacy policy.
      </p>
      <div className="mt-4 space-y-4">
        {[
          {
            name: "SUPABASE",
            url: "supabase.com",
            desc: "Authentication and database. Your email address and hashed password are stored in Supabase's infrastructure.",
          },
          {
            name: "STRIPE",
            url: "stripe.com",
            desc: "Payment processing. Stripe handles all payment card data. We store only your Stripe customer ID and subscription status.",
          },
          {
            name: "RESEND",
            url: "resend.com",
            desc: "Transactional email delivery (welcome emails, password resets). Your email address is passed to Resend solely to deliver service emails.",
          },
          {
            name: "FINANCIAL MODELING PREP",
            url: "financialmodelingprep.com",
            desc: "Financial data provider. No personal data is shared with this provider.",
          },
          {
            name: "VERCEL",
            url: "vercel.com",
            desc: "Hosting and infrastructure. Vercel may log request metadata (IP, timestamps) as part of their standard platform operation.",
          },
          {
            name: "POSTHOG",
            url: "posthog.com",
            desc: "Product analytics. PostHog collects page views, feature usage, and interaction patterns to help us understand and improve the Service. PostHog is only activated if you accept cookies. If you decline, PostHog does not initialise and no analytics data is sent.",
          },
          {
            name: "SENTRY",
            url: "sentry.io",
            desc: "Error monitoring and site reliability. Sentry captures application errors and performance traces to help us identify and fix bugs. Error tracking is always active to maintain a reliable service. Session recordings (which capture anonymised screen activity) are only enabled if you accept cookies — declining disables them entirely.",
          },
        ].map(({ name, desc }) => (
          <div
            key={name}
            className="rounded p-4"
            style={{ border: "1px solid rgba(0,255,65,0.12)", background: "rgba(0,255,65,0.02)" }}
          >
            <p className="text-xs font-bold tracking-widest mb-1.5" style={{ color: "rgba(0,255,65,0.6)" }}>
              {name}
            </p>
            <p className={body} style={{ color: dim }}>{desc}</p>
          </div>
        ))}
      </div>

      {/* 4 */}
      <p className={h} style={{ color: accent }}>4. COOKIES AND ANALYTICS</p>
      <p className={body} style={{ color: dim }}>
        We use the following categories of cookies and local storage:
      </p>
      <ul className={`${body} mt-3 space-y-3 pl-4`} style={{ color: dim }}>
        <li style={{ listStyleType: "disc" }}>
          <strong style={{ color: "rgba(0,255,65,0.6)" }}>Strictly necessary</strong> — session
          tokens managed by Supabase to keep you signed in. These are always active and cannot
          be declined without breaking authentication.
        </li>
        <li style={{ listStyleType: "disc" }}>
          <strong style={{ color: "rgba(0,255,65,0.6)" }}>Analytics (PostHog)</strong> — page
          views and feature usage to help us improve the Service. Only activated if you click
          Accept on the cookie banner. If you decline, PostHog is never initialised.
        </li>
        <li style={{ listStyleType: "disc" }}>
          <strong style={{ color: "rgba(0,255,65,0.6)" }}>Error monitoring (Sentry)</strong> —
          application errors and performance traces are always collected to maintain a reliable
          service. Session recordings are an optional part of Sentry and are disabled if you
          decline cookies.
        </li>
      </ul>
      <p className={`${body} mt-3`} style={{ color: dim }}>
        We do not use advertising cookies or sell data to third parties. You may also disable
        cookies in your browser settings, though this will prevent you from staying signed in.
      </p>

      {/* 5 */}
      <p className={h} style={{ color: accent }}>5. DATA RETENTION</p>
      <p className={body} style={{ color: dim }}>
        We retain your account data for as long as your account is active. If you delete your
        account, we will delete or anonymise your personal data within 30 days, except where
        we are required to retain it for legal or regulatory purposes (e.g., billing records
        for tax compliance, typically 7 years).
      </p>

      {/* 6 */}
      <p className={h} style={{ color: accent }}>6. YOUR RIGHTS</p>
      <p className={body} style={{ color: dim }}>
        Depending on your jurisdiction, you may have the right to:
      </p>
      <ul className={`${body} mt-3 space-y-2 pl-4`} style={{ color: dim }}>
        <li style={{ listStyleType: "disc" }}>Access the personal data we hold about you.</li>
        <li style={{ listStyleType: "disc" }}>Request correction of inaccurate data.</li>
        <li style={{ listStyleType: "disc" }}>Request deletion of your data (&ldquo;right to be forgotten&rdquo;).</li>
        <li style={{ listStyleType: "disc" }}>Object to or restrict certain processing.</li>
        <li style={{ listStyleType: "disc" }}>
          Data portability — receive your data in a structured, machine-readable format.
        </li>
        <li style={{ listStyleType: "disc" }}>
          Lodge a complaint with your local data protection authority (e.g., ICO in the UK,
          CNIL in France).
        </li>
      </ul>
      <p className={`${body} mt-3`} style={{ color: dim }}>
        To exercise any of these rights, email us at{" "}
        <a href="mailto:hello@stocksnack.app" style={{ color: "#00ff41" }} className="underline">
          hello@stocksnack.app
        </a>
        . We will respond within 30 days.
      </p>

      {/* 7 */}
      <p className={h} style={{ color: accent }}>7. SECURITY</p>
      <p className={body} style={{ color: dim }}>
        We take reasonable technical and organisational measures to protect your data, including
        encrypted connections (HTTPS), hashed password storage, and access controls. However,
        no transmission over the internet is completely secure. You are responsible for keeping
        your password confidential.
      </p>

      {/* 8 */}
      <p className={h} style={{ color: accent }}>8. CHILDREN&rsquo;S PRIVACY</p>
      <p className={body} style={{ color: dim }}>
        The Service is not directed at anyone under the age of 18. We do not knowingly collect
        personal data from minors. If you believe a minor has provided us with personal data,
        please contact us and we will delete it promptly.
      </p>

      {/* 9 */}
      <p className={h} style={{ color: accent }}>9. INTERNATIONAL TRANSFERS</p>
      <p className={body} style={{ color: dim }}>
        Our infrastructure and third-party providers may process your data in countries outside
        your own, including the United States. Where required, we rely on appropriate safeguards
        (such as standard contractual clauses) to protect your data during international
        transfers.
      </p>

      {/* 10 */}
      <p className={h} style={{ color: accent }}>10. CHANGES TO THIS POLICY</p>
      <p className={body} style={{ color: dim }}>
        We may update this Privacy Policy from time to time. When we do, we will revise the
        &ldquo;Effective date&rdquo; at the top of this page and, for material changes, notify
        you by email. Continued use of the Service after the revised policy takes effect
        constitutes your acceptance.
      </p>

      {/* 11 */}
      <p className={h} style={{ color: accent }}>11. CONTACT</p>
      <p className={body} style={{ color: dim }}>
        For privacy-related questions or requests, contact us at{" "}
        <a href="mailto:hello@stocksnack.app" style={{ color: "#00ff41" }} className="underline">
          hello@stocksnack.app
        </a>
        .
      </p>

      <div className="mt-16 pt-8 border-t" style={{ borderColor: "rgba(0,255,65,0.1)" }}>
        <p className="text-xs" style={{ color: "rgba(0,255,65,0.2)" }}>
          STOCKSNACK · LAST UPDATED JUNE 6, 2026
        </p>
      </div>
    </div>
  );
}
