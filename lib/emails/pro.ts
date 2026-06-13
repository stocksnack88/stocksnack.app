import { resend } from "@/lib/resend";

export async function sendProEmail(toEmail: string): Promise<void> {
  await resend.emails.send({
    from: "StockSnack <hello@stocksnack.app>",
    to: toEmail,
    subject: "You're now Pro — welcome to StockSnack Pro",
    html: `<html>
<body style="background-color:#000000;margin:0;padding:0;font-family:'Courier New',monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#000000;border:1px solid #00ff41;border-radius:8px;padding:48px 40px;">
          <tr><td style="padding-bottom:40px;"><p style="color:#00ff41;font-size:13px;letter-spacing:4px;margin:0;">STOCKSNACK</p></td></tr>
          <tr><td style="padding-bottom:16px;"><p style="color:#00ff41;font-size:22px;font-weight:bold;margin:0;">You're now Pro.</p></td></tr>
          <tr><td style="padding-bottom:32px;"><p style="color:#00aa30;font-size:13px;margin:0;line-height:1.7;">Full access to all 500 S&P 500 stocks, filters, scoring layers, and valuation analysis. Go find your next investment.</p></td></tr>
          <tr><td style="padding-bottom:40px;"><a href="https://stocksnack.app/screener" style="display:block;background-color:#00ff41;color:#000000;font-family:'Courier New',monospace;font-size:14px;font-weight:bold;letter-spacing:2px;padding:18px;text-decoration:none;border-radius:4px;text-align:center;">GO TO SCREENER →</a></td></tr>
          <tr><td style="border-top:1px solid #001a08;padding-top:20px;">
            <p style="color:#004415;font-size:11px;margin:0 0 8px 0;line-height:1.6;">Questions? Reply to this email or visit stocksnack.app</p>
            <p style="color:#003310;font-size:11px;margin:0;line-height:1.6;">You can cancel anytime from your account page.</p>
            <p style="color:#002208;font-size:10px;margin:12px 0 0 0;">stocksnack.app · Not financial advice · For informational purposes only</p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  });
}
