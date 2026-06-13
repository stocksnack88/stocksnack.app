import { resend } from "@/lib/resend";

export async function sendWelcomeEmail(toEmail: string): Promise<void> {
  await resend.emails.send({
    from: "StockSnack <hello@stocksnack.app>",
    to: toEmail,
    subject: "Welcome to StockSnack",
    html: `<html>
<body bgcolor="#000000" style="background-color:#000000;margin:0;padding:0;font-family:'Courier New',monospace;">
  <table bgcolor="#000000" width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000;padding:40px 0;">
    <tr>
      <td bgcolor="#000000" align="center" style="background-color:#000000;">
        <table bgcolor="#000000" width="560" cellpadding="0" cellspacing="0" style="background-color:#000000;border:1px solid #00ff41;border-radius:8px;padding:48px 40px;">
          <tr><td bgcolor="#000000" style="background-color:#000000;padding-bottom:16px;text-align:center;">
  <img src="https://stocksnack.app/icon.png" width="56" height="56" alt="StockSnack" style="display:block;margin:0 auto;border-radius:10px;" />
</td></tr>
          <tr><td bgcolor="#000000" style="background-color:#000000;padding-bottom:32px;text-align:center;">
  <p style="color:#00ff41;font-size:20px;font-weight:bold;letter-spacing:6px;margin:0;">STOCKSNACK</p>
</td></tr>
          <tr><td bgcolor="#000000" style="background-color:#000000;padding-bottom:16px;"><p style="color:#00ff41;font-size:22px;font-weight:bold;margin:0;">Welcome aboard.</p></td></tr>
          <tr><td bgcolor="#000000" style="background-color:#000000;padding-bottom:32px;"><p style="color:#00aa30;font-size:13px;margin:0;line-height:1.7;">Your free trial is ready. Head to the screener and find out which S&P 500 stock is ranked #1 today.</p></td></tr>
          <tr><td bgcolor="#000000" style="background-color:#000000;padding-bottom:40px;"><a href="https://stocksnack.app/screener" style="display:block;background-color:#00ff41;color:#000000;font-family:'Courier New',monospace;font-size:14px;font-weight:bold;letter-spacing:2px;padding:18px;text-decoration:none;border-radius:4px;text-align:center;">START MY FREE TRIAL →</a></td></tr>
          <tr><td bgcolor="#000000" style="background-color:#000000;border-top:1px solid #001a08;padding-top:20px;"><p style="color:#003310;font-size:11px;margin:0;line-height:1.6;">stocksnack.app · Not financial advice · For informational purposes only</p></td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  });
}
