export const metadata = {
  title: "Terms of Service — StockSnack",
};

const h = "text-xs font-bold tracking-widest mt-10 mb-3";
const body = "text-xs leading-relaxed";
const dim = "rgba(0,255,65,0.45)";
const dimmer = "rgba(0,255,65,0.28)";
const accent = "rgba(0,255,65,0.7)";

export default function TosPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <p className="text-xs tracking-[0.3em] mb-3" style={{ color: "rgba(0,255,65,0.35)" }}>
        LEGAL
      </p>
      <h1 className="text-2xl font-bold tracking-widest mb-2" style={{ color: "#00ff41" }}>
        TERMS OF SERVICE
      </h1>
      <p className="text-xs mb-1" style={{ color: dimmer }}>
        Effective date: June 7, 2026
      </p>
      <p className="text-xs mb-8" style={{ color: dimmer }}>
        Operator: StockSnack, Malaysia &mdash;{" "}
        <a href="mailto:stocksnack88@gmail.com" style={{ color: "#00ff41" }} className="underline">
          stocksnack88@gmail.com
        </a>
      </p>

      {/* Disclaimer box */}
      <div
        className="rounded p-5 mb-10"
        style={{ border: "1px solid rgba(0,255,65,0.4)", background: "rgba(0,255,65,0.04)" }}
      >
        <p className="text-xs font-bold tracking-widest mb-2" style={{ color: "#00ff41" }}>
          NOT FINANCIAL ADVICE
        </p>
        <p className={body} style={{ color: dim }}>
          StockSnack is a stock screener tool. Everything on this site is{" "}
          <strong style={{ color: accent }}>for informational purposes only</strong>. We are not
          licensed financial advisors. Do not make investment decisions based solely on this tool.
          Always consult a qualified financial adviser before investing.
        </p>
      </div>

      {/* 1 */}
      <p className={h} style={{ color: accent }}>1. WHAT STOCKSNACK IS</p>
      <p className={body} style={{ color: dim }}>
        StockSnack is an algorithmic stock screening tool that scores S&amp;P 500 stocks across
        four dimensions: price projection, growth quality, financial health, and an overall
        signal. Scores are computed from publicly available financial data and updated weekly.
      </p>
      <p className={`${body} mt-3`} style={{ color: dim }}>
        StockSnack is <strong style={{ color: accent }}>not a licensed investment adviser</strong>,
        broker, or financial planner. The scores, signals, and rankings on this site are the
        output of an automated model — they are not personalised recommendations. Do not rely
        solely on this tool when making any investment decision.
      </p>

      {/* 2 */}
      <p className={h} style={{ color: accent }}>2. FREE VS PRO ACCESS</p>
      <p className={body} style={{ color: dim }}>
        StockSnack is available in two tiers:
      </p>
      <div className="mt-4 space-y-3">
        {[
          {
            label: "FREE",
            desc: "Access to a rotating selection of 5 stocks per day, updated daily. Basic screener view with signal and return data.",
          },
          {
            label: "PRO",
            desc: "Full access to all 500 S&P 500 stocks with complete scoring breakdowns, filters, and detail pages. Billed monthly.",
          },
        ].map(({ label, desc }) => (
          <div
            key={label}
            className="rounded p-4"
            style={{ border: "1px solid rgba(0,255,65,0.12)", background: "rgba(0,255,65,0.02)" }}
          >
            <p className="text-xs font-bold tracking-widest mb-1.5" style={{ color: "rgba(0,255,65,0.6)" }}>
              {label}
            </p>
            <p className={body} style={{ color: dim }}>{desc}</p>
          </div>
        ))}
      </div>
      <p className={`${body} mt-4`} style={{ color: dim }}>
        The features included in each tier may change over time. We will give reasonable notice
        before making changes that materially reduce what you get.
      </p>

      {/* 3 */}
      <p className={h} style={{ color: accent }}>3. PAYMENTS AND BILLING</p>
      <p className={body} style={{ color: dim }}>
        Payments are processed by <strong style={{ color: accent }}>Stripe</strong>. By
        subscribing, you authorise Stripe to charge your payment method on a recurring monthly
        basis until you cancel.
      </p>
      <ul className={`${body} mt-3 space-y-2 pl-4`} style={{ color: dim }}>
        <li style={{ listStyleType: "disc" }}>
          Subscriptions <strong style={{ color: accent }}>auto-renew</strong> each month unless
          cancelled before the next billing date.
        </li>
        <li style={{ listStyleType: "disc" }}>
          You can <strong style={{ color: accent }}>cancel anytime</strong> from your account
          settings. Cancellation takes effect at the end of the current billing period.
        </li>
        <li style={{ listStyleType: "disc" }}>
          <strong style={{ color: accent }}>No refunds</strong> are issued for the current
          billing period once it has started, unless required by applicable law.
        </li>
      </ul>

      {/* 4 */}
      <p className={h} style={{ color: accent }}>4. PROMOTIONAL PRICING</p>
      <p className={body} style={{ color: dim }}>
        If you subscribed at a promotional or discounted price, that price is{" "}
        <strong style={{ color: accent }}>locked for life</strong> — it will not increase as
        long as your subscription remains active and uninterrupted.
      </p>
      <p className={`${body} mt-3`} style={{ color: dim }}>
        However, if you cancel your subscription and later resubscribe, the promotional rate{" "}
        <strong style={{ color: accent }}>cannot be reapplied</strong>. You will be charged the
        current standard rate at the time of resubscription.
      </p>

      {/* 5 */}
      <p className={h} style={{ color: accent }}>5. DATA ACCURACY</p>
      <p className={body} style={{ color: dim }}>
        We source financial data from third-party providers and do our best to keep it accurate
        and up to date. However, data may occasionally be delayed, incomplete, or contain errors.
      </p>
      <p className={`${body} mt-3`} style={{ color: dim }}>
        StockSnack is not liable for any investment losses, missed opportunities, or other
        damages arising from reliance on data or scores that turn out to be inaccurate or
        delayed. You use this tool entirely at your own risk.
      </p>

      {/* 6 */}
      <p className={h} style={{ color: accent }}>6. TERMINATION</p>
      <p className={body} style={{ color: dim }}>
        We reserve the right to suspend or terminate accounts that abuse the service — including
        scraping, sharing account access, or any other behaviour that violates these terms or
        degrades the experience for other users. If your account is terminated for abuse, no
        refund will be issued for any remaining subscription period.
      </p>

      {/* 7 */}
      <p className={h} style={{ color: accent }}>7. CHANGES TO THESE TERMS</p>
      <p className={body} style={{ color: dim }}>
        We may update these Terms from time to time. When we do, we will update the effective
        date at the top of this page. For material changes, we will notify you by email at least
        14 days before they take effect. Continued use of StockSnack after the updated Terms
        take effect means you accept them.
      </p>

      {/* 8 */}
      <p className={h} style={{ color: accent }}>8. GOVERNING LAW</p>
      <p className={body} style={{ color: dim }}>
        These Terms are governed by the laws of Malaysia. Any disputes that cannot be resolved
        informally will be subject to the jurisdiction of the courts of Malaysia.
      </p>

      {/* 9 */}
      <p className={h} style={{ color: accent }}>9. CONTACT</p>
      <p className={body} style={{ color: dim }}>
        For any questions about these Terms, contact us at{" "}
        <a href="mailto:stocksnack88@gmail.com" style={{ color: "#00ff41" }} className="underline">
          stocksnack88@gmail.com
        </a>
        .
      </p>

      <div className="mt-16 pt-8 border-t" style={{ borderColor: "rgba(0,255,65,0.1)" }}>
        <p className="text-xs" style={{ color: "rgba(0,255,65,0.2)" }}>
          STOCKSNACK · LAST UPDATED JUNE 7, 2026
        </p>
      </div>
    </div>
  );
}
