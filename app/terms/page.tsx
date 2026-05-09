export const metadata = {
  title: "Terms of Service — StockSnack",
};

const h = "text-xs font-bold tracking-widest mt-10 mb-3";
const body = "text-xs leading-relaxed";
const dim = "rgba(0,255,65,0.45)";
const dimmer = "rgba(0,255,65,0.28)";
const accent = "rgba(0,255,65,0.7)";

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <p className="text-xs tracking-[0.3em] mb-3" style={{ color: "rgba(0,255,65,0.35)" }}>
        LEGAL
      </p>
      <h1 className="text-2xl font-bold tracking-widest mb-2" style={{ color: "#00ff41" }}>
        TERMS OF SERVICE
      </h1>
      <p className="text-xs mb-8" style={{ color: dimmer }}>
        Effective date: May 9, 2026
      </p>

      {/* Disclaimer box */}
      <div
        className="rounded p-5 mb-10"
        style={{
          border: "1px solid rgba(0,255,65,0.4)",
          background: "rgba(0,255,65,0.04)",
        }}
      >
        <p className="text-xs font-bold tracking-widest mb-2" style={{ color: "#00ff41" }}>
          IMPORTANT DISCLAIMER
        </p>
        <p className={body} style={{ color: dim }}>
          StockSnack is an algorithmic stock screening tool. All scores, rankings, and content
          provided on this platform are for <strong style={{ color: accent }}>informational
          purposes only</strong> and do not constitute investment advice, a recommendation to
          buy or sell any security, or a solicitation of any kind. StockSnack is{" "}
          <strong style={{ color: accent }}>not a registered investment adviser</strong> under
          applicable securities laws. You should consult a licensed financial adviser before
          making any investment decisions.
        </p>
      </div>

      {/* 1 */}
      <p className={h} style={{ color: accent }}>1. ACCEPTANCE OF TERMS</p>
      <p className={body} style={{ color: dim }}>
        By accessing or using StockSnack (&ldquo;the Service&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;, &ldquo;our&rdquo;), you agree to be bound by these Terms of Service
        (&ldquo;Terms&rdquo;). If you do not agree, do not use the Service. These Terms apply to
        all visitors, registered users, and subscribers.
      </p>

      {/* 2 */}
      <p className={h} style={{ color: accent }}>2. DESCRIPTION OF SERVICE</p>
      <p className={body} style={{ color: dim }}>
        StockSnack is a web-based stock screening platform that applies a quantitative,
        rules-based scoring model to publicly available financial data. The Service assigns
        algorithmic scores across four dimensions — price projection, growth metrics, financial
        health, and quality indicators — for a curated list of large-cap equities. Scores are
        updated on a weekly basis.
      </p>
      <p className={`${body} mt-3`} style={{ color: dim }}>
        The Service is offered in a free tier (limited access) and a paid Pro tier (full access),
        as described on our{" "}
        <a href="/pricing" style={{ color: "#00ff41" }} className="underline">
          Pricing page
        </a>
        .
      </p>

      {/* 3 */}
      <p className={h} style={{ color: accent }}>3. NO FINANCIAL ADVICE</p>
      <p className={body} style={{ color: dim }}>
        Nothing on StockSnack constitutes financial, investment, tax, legal, or any other form
        of professional advice. Specifically:
      </p>
      <ul className={`${body} mt-3 space-y-2 pl-4`} style={{ color: dim }}>
        <li style={{ listStyleType: "disc" }}>
          Scores and rankings are the output of an automated, algorithmic model applied to
          third-party financial data. They do not account for your personal financial situation,
          risk tolerance, investment goals, or tax circumstances.
        </li>
        <li style={{ listStyleType: "disc" }}>
          A high score does not represent a recommendation to buy a security. A low score does
          not represent a recommendation to sell.
        </li>
        <li style={{ listStyleType: "disc" }}>
          Past model performance does not guarantee future results.
        </li>
        <li style={{ listStyleType: "disc" }}>
          All investing involves risk, including the potential loss of principal.
        </li>
      </ul>
      <p className={`${body} mt-3`} style={{ color: dim }}>
        Always conduct your own due diligence and consult a qualified financial adviser before
        making investment decisions.
      </p>

      {/* 4 */}
      <p className={h} style={{ color: accent }}>4. ACCOUNT REGISTRATION</p>
      <p className={body} style={{ color: dim }}>
        You must provide a valid email address to create an account. You are responsible for
        maintaining the confidentiality of your login credentials and for all activity that
        occurs under your account. You must notify us immediately at{" "}
        <a href="mailto:hello@stocksnack.app" style={{ color: "#00ff41" }} className="underline">
          hello@stocksnack.app
        </a>{" "}
        if you suspect unauthorised access. You may not share your account with others.
      </p>

      {/* 5 */}
      <p className={h} style={{ color: accent }}>5. SUBSCRIPTIONS AND BILLING</p>
      <p className={body} style={{ color: dim }}>
        Paid subscriptions are billed monthly in advance through our payment processor, Stripe.
        By subscribing, you authorise us to charge your payment method on a recurring basis
        until you cancel.
      </p>
      <p className={`${body} mt-3`} style={{ color: dim }}>
        You may cancel your subscription at any time through your account settings or by
        contacting us. Cancellation takes effect at the end of the current billing period; no
        partial-period refunds are issued unless required by applicable law. We reserve the
        right to change subscription pricing with at least 30 days&rsquo; notice.
      </p>

      {/* 6 */}
      <p className={h} style={{ color: accent }}>6. DATA ACCURACY</p>
      <p className={body} style={{ color: dim }}>
        Financial data used to compute scores is sourced from third-party providers (currently
        Financial Modeling Prep). We do not independently verify this data and make no
        representations or warranties regarding its accuracy, completeness, or timeliness.
        Data delays, errors, or omissions may affect scores. You use all data at your own risk.
      </p>

      {/* 7 */}
      <p className={h} style={{ color: accent }}>7. ACCEPTABLE USE</p>
      <p className={body} style={{ color: dim }}>
        You agree not to: (a) scrape, crawl, or systematically download content from the
        Service; (b) reproduce or redistribute scores or rankings for commercial purposes
        without written permission; (c) attempt to reverse-engineer the scoring methodology;
        (d) use the Service for any unlawful purpose; (e) introduce malware or interfere with
        the Service&rsquo;s operation.
      </p>

      {/* 8 */}
      <p className={h} style={{ color: accent }}>8. INTELLECTUAL PROPERTY</p>
      <p className={body} style={{ color: dim }}>
        All content, scoring methodology, algorithms, design, and code comprising the Service
        are the proprietary property of StockSnack and its licensors. You are granted a limited,
        non-exclusive, non-transferable licence to access and use the Service for personal,
        non-commercial purposes only. No other rights are granted.
      </p>

      {/* 9 */}
      <p className={h} style={{ color: accent }}>9. DISCLAIMERS</p>
      <p className={body} style={{ color: dim }}>
        THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
        WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT
        WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL
        COMPONENTS.
      </p>

      {/* 10 */}
      <p className={h} style={{ color: accent }}>10. LIMITATION OF LIABILITY</p>
      <p className={body} style={{ color: dim }}>
        TO THE FULLEST EXTENT PERMITTED BY LAW, STOCKSNACK SHALL NOT BE LIABLE FOR ANY
        INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF
        PROFITS OR INVESTMENT LOSSES, ARISING FROM YOUR USE OF THE SERVICE. IN NO EVENT SHALL
        OUR TOTAL LIABILITY EXCEED THE AMOUNT YOU PAID TO US IN THE TWELVE MONTHS PRECEDING
        THE CLAIM.
      </p>

      {/* 11 */}
      <p className={h} style={{ color: accent }}>11. INDEMNIFICATION</p>
      <p className={body} style={{ color: dim }}>
        You agree to indemnify and hold harmless StockSnack and its operators from any claims,
        damages, or expenses (including reasonable legal fees) arising from your use of the
        Service, your violation of these Terms, or your violation of any third-party rights.
      </p>

      {/* 12 */}
      <p className={h} style={{ color: accent }}>12. TERMINATION</p>
      <p className={body} style={{ color: dim }}>
        We may suspend or terminate your account at any time for violation of these Terms or for
        any other reason at our discretion, with or without notice. Upon termination, your right
        to use the Service ceases immediately. Provisions that by their nature should survive
        termination will do so, including Sections 3, 9, 10, and 11.
      </p>

      {/* 13 */}
      <p className={h} style={{ color: accent }}>13. GOVERNING LAW</p>
      <p className={body} style={{ color: dim }}>
        These Terms are governed by and construed in accordance with applicable law. Any
        disputes shall be resolved through good-faith negotiation where possible. If a dispute
        cannot be resolved informally, it shall be submitted to the courts of competent
        jurisdiction. If any provision of these Terms is held invalid, the remaining provisions
        continue in full force.
      </p>

      {/* 14 */}
      <p className={h} style={{ color: accent }}>14. CHANGES TO THESE TERMS</p>
      <p className={body} style={{ color: dim }}>
        We may update these Terms from time to time. Material changes will be communicated via
        email or a notice on the Service at least 14 days before taking effect. Continued use
        of the Service after changes take effect constitutes acceptance of the revised Terms.
      </p>

      {/* 15 */}
      <p className={h} style={{ color: accent }}>15. CONTACT</p>
      <p className={body} style={{ color: dim }}>
        For questions about these Terms, contact us at{" "}
        <a href="mailto:hello@stocksnack.app" style={{ color: "#00ff41" }} className="underline">
          hello@stocksnack.app
        </a>
        .
      </p>

      <div className="mt-16 pt-8 border-t" style={{ borderColor: "rgba(0,255,65,0.1)" }}>
        <p className="text-xs" style={{ color: "rgba(0,255,65,0.2)" }}>
          STOCKSNACK · LAST UPDATED MAY 9, 2026
        </p>
      </div>
    </div>
  );
}
