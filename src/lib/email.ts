import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL ?? "Attraction by Video <onboarding@resend.dev>";

export async function sendLoginCode(to: string, code: string, name?: string | null) {
  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi,";

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Your login code: ${code}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f1f1ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f1ef;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="display:inline-block;background:#1e2a38;border-radius:16px;padding:12px;">
                <span style="font-size:28px;">📹</span>
              </div>
              <div style="margin-top:12px;font-size:18px;font-weight:700;color:#1e2a38;">Attraction by Video</div>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;padding:40px 36px;border:1px solid #e5e7eb;">
              <p style="margin:0 0 8px;font-size:15px;color:#1e2a38;">${greeting}</p>
              <p style="margin:0 0 28px;font-size:15px;color:#1e2a38;">Here is your login code:</p>

              <!-- Code box -->
              <div style="background:#f1f1ef;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;letter-spacing:0.25em;">
                <span style="font-size:40px;font-weight:800;color:#1e2a38;font-family:'Courier New',monospace;">${code}</span>
              </div>

              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">This code expires in <strong>10 minutes</strong> and can only be used once.</p>
              <p style="margin:0;font-size:13px;color:#6b7280;">If you didn't request this, you can safely ignore this email.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} Attraction by Video</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  });

  if (error) {
    console.error("[email] Failed to send login code:", error);

    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `\n${"=".repeat(60)}\n[DEV LOGIN CODE] Email failed — use this code to sign in:\n\n  Email: ${to}\n  Code:  ${code}\n${"=".repeat(60)}\n`
      );
      return;
    }

    throw new Error("Failed to send email");
  }
}
