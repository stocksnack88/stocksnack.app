import { resend } from "@/lib/resend";

export function welcomeEmailHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <title>Welcome to StockSnack</title>
</head>
<body style="margin:0;padding:0;background-color:#000000;font-family:'Courier New',Courier,monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#000000;">
    <tr>
      <td align="center" style="padding:48px 20px;">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:28px;border-bottom:1px solid rgba(0,255,65,0.2);">
              <p style="margin:0;font-size:15px;font-weight:700;letter-spacing:0.25em;color:#00ff41;">
                STOCKSNACK
              </p>
              <p style="margin:5px 0 0;font-size:10px;letter-spacing:0.35em;color:rgba(0,255,65,0.4);">
                BUFFETT-STYLE STOCK SCREENER
              </p>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="padding:32px 0 24px;">
              <h1 style="margin:0 0 14px;font-size:20px;font-weight:700;letter-spacing:0.15em;color:#00ff41;line-height:1.3;">
                WELCOME TO STOCKSNACK
              </h1>
              <p style="margin:0;font-size:13px;line-height:1.75;color:rgba(0,255,65,0.6);">
                Your free account is ready. We score 20 large-cap stocks every week
                using a 4-layer fundamental model — valuation, growth, financial health,
                and Buffett-tier quality — so you always know what&rsquo;s worth a closer look.
              </p>
            </td>
          </tr>

          <!-- What you get -->
          <tr>
            <td style="padding-bottom:28px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                style="border:1px solid rgba(0,255,65,0.2);border-radius:6px;background-color:rgba(0,255,65,0.03);">
                <tr>
                  <td style="padding:22px 26px;">
                    <p style="margin:0 0 18px;font-size:10px;font-weight:700;letter-spacing:0.35em;color:rgba(0,255,65,0.45);">
                      YOUR FREE PLAN INCLUDES
                    </p>

                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:13px;">
                      <tr>
                        <td width="18" valign="top" style="font-size:12px;font-weight:700;color:#00ff41;padding-top:1px;">✓</td>
                        <td style="font-size:12px;line-height:1.6;color:rgba(0,255,65,0.7);padding-left:10px;">
                          <strong style="color:#00ff41;">5 top-ranked stocks</strong> from our universe of 20 large-caps
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:13px;">
                      <tr>
                        <td width="18" valign="top" style="font-size:12px;font-weight:700;color:#00ff41;padding-top:1px;">✓</td>
                        <td style="font-size:12px;line-height:1.6;color:rgba(0,255,65,0.7);padding-left:10px;">
                          Full screener table with <strong style="color:#00ff41;">BUY · HOLD · SELL</strong> signals updated weekly
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td width="18" valign="top" style="font-size:12px;font-weight:700;color:#00ff41;padding-top:1px;">✓</td>
                        <td style="font-size:12px;line-height:1.6;color:rgba(0,255,65,0.7);padding-left:10px;">
                          Composite score: <strong style="color:#00ff41;">PPM · Growth · Health · Final</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <a href="https://stocksnack.app/screener"
                style="display:inline-block;background-color:#00ff41;color:#000000;font-size:12px;font-weight:700;letter-spacing:0.2em;text-decoration:none;padding:13px 36px;border-radius:4px;">
                VIEW YOUR SCREENER &rarr;
              </a>
            </td>
          </tr>

          <!-- Upgrade nudge -->
          <tr>
            <td align="center" style="padding-bottom:36px;">
              <p style="margin:0;font-size:11px;line-height:1.6;color:rgba(0,255,65,0.3);">
                Want all 20 stocks with full detail pages and fair-value breakdowns?<br />
                <a href="https://stocksnack.app/pricing"
                  style="color:rgba(0,255,65,0.55);text-decoration:underline;">
                  Upgrade to Pro &mdash; $20&thinsp;/&thinsp;mo
                </a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;border-top:1px solid rgba(0,255,65,0.1);">
              <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.2em;color:rgba(0,255,65,0.2);">
                DATA &middot; FINANCIALMODELINGPREP &middot; SCORES UPDATED WEEKLY
              </p>
              <p style="margin:0;font-size:10px;color:rgba(0,255,65,0.15);">
                You&rsquo;re receiving this because you created an account at stocksnack.app
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendWelcomeEmail(toEmail: string): Promise<void> {
  await resend.emails.send({
    from: "StockSnack <hello@stocksnack.app>",
    to: toEmail,
    subject: "Welcome to StockSnack 🟢",
    html: welcomeEmailHtml(),
  });
}
