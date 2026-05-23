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

export async function sendWaitlistNotification(
  memberName: string,
  memberEmail: string,
  packageName: string,
  categoryName: string
) {
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: "jared@attractionbyvideo.com",
    subject: `New Waitlist Request — ${packageName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f1f1ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f1ef;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="display:inline-block;background:#1e2a38;border-radius:16px;padding:12px;">
                <span style="font-size:28px;">📹</span>
              </div>
              <div style="margin-top:12px;font-size:18px;font-weight:700;color:#1e2a38;">Attraction by Video</div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:16px;padding:40px 36px;border:1px solid #e5e7eb;">
              <p style="margin:0 0 16px;font-size:15px;color:#1e2a38;font-weight:600;">New Waitlist Request</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                <strong>${memberName}</strong> (${memberEmail}) is interested in the <strong>${packageName}</strong> package (${categoryName}) and would like to learn more and join the waitlist.
              </p>
              <div style="background:#f1f1ef;border-radius:12px;padding:16px 20px;">
                <p style="margin:0 0 6px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Package</p>
                <p style="margin:0;font-size:15px;font-weight:700;color:#1e2a38;">${packageName}</p>
                <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${categoryName}</p>
              </div>
            </td>
          </tr>
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
    console.error("[email] Failed to send waitlist notification:", error);
  }
}

export async function sendAuditReadyEmail(params: {
  to: string;
  memberName: string | null;
  auditId: string;
  auditType: "baseline" | "monthly" | "single_video";
  videoTitle?: string | null;
}): Promise<void> {
  const { to, memberName, auditId, auditType, videoTitle } = params;

  const greeting = memberName ? `Hi ${memberName.split(" ")[0]},` : "Hi,";

  const auditLabel =
    auditType === "baseline"
      ? "baseline Attraction Audit"
      : auditType === "monthly"
      ? "monthly Attraction Audit"
      : videoTitle
      ? `video audit for "${videoTitle}"`
      : "video audit";

  const contextLine =
    auditType === "baseline"
      ? "This is your starting point — the benchmark we'll measure every future audit against."
      : auditType === "monthly"
      ? "We've run your channel through the 16-principle scorecard again and flagged what's moved since last month."
      : "We've broken down the video's opening, insights, connection, and lead-generation signals against your avatar.";

  const subject =
    auditType === "baseline"
      ? "Your baseline Attraction Audit is ready"
      : auditType === "monthly"
      ? "Your monthly Attraction Audit is ready"
      : videoTitle
      ? `Your video audit is ready — ${videoTitle}`
      : "Your video audit is ready";

  // Always use a public production-style URL for email content. Falling back
  // to NEXTAUTH_URL would point recipients at localhost in dev environments,
  // which breaks both the logo image and the audit link in their inbox.
  const rawBase =
    process.env.EMAIL_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.NEXTAUTH_URL && !/localhost|127\.0\.0\.1|0\.0\.0\.0|\.repl(\.co|it\.dev)/i.test(process.env.NEXTAUTH_URL)
      ? process.env.NEXTAUTH_URL
      : null) ??
    "https://members.attractionbyvideo.com";
  const baseUrl = rawBase.replace(/\/$/, "");
  const auditUrl = `${baseUrl}/reports/${auditId}`;
  const logoUrl = `${baseUrl}/logo.png`;

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f1f1ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f1ef;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="${logoUrl}" alt="Attraction by Video" width="200" style="display:block;width:200px;max-width:60%;height:auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:16px;padding:40px 36px;border:1px solid #e5e7eb;">
              <p style="margin:0 0 16px;font-size:15px;color:#1e2a38;">${greeting}</p>
              <p style="margin:0 0 16px;font-size:15px;color:#1e2a38;">Your ${auditLabel} is ready to view.</p>
              <p style="margin:0 0 28px;font-size:15px;color:#374151;">${contextLine}</p>

              <div style="text-align:center;margin:0 0 28px;">
                <a href="${auditUrl}" style="display:inline-block;background:#1e2a38;color:#ffffff;border-radius:100px;padding:14px 28px;font-weight:700;text-decoration:none;font-size:15px;">View your audit →</a>
              </div>

              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.6;">
                The report covers your channel across 16 principles, with per-video breakdowns and targeted recommendations. It's all saved to your Attraction Dashboard — log in anytime to revisit it.
              </p>
              <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">— The Attraction by Video Team</p>
            </td>
          </tr>
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
    console.error("[email] Failed to send audit-ready email:", error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Backfill-completion email (Wave 1 Phase 2A)
// ─────────────────────────────────────────────────────────────────────────────

interface BackfillCompletionParams {
  to: string;
  memberName: string | null;
  successCount: number;
  failedCount: number;
  succeededMonths: Array<{ monthYear: string; label: string }>;
  failedUploads: Array<{
    monthYear: string;
    label: string;
    friendly: { title: string; body: string };
  }>;
}

export async function sendBackfillCompletionEmail(
  params: BackfillCompletionParams,
): Promise<void> {
  const { to, memberName, successCount, failedCount, succeededMonths, failedUploads } = params;
  const greeting = memberName ? `Hi ${memberName.split(" ")[0]},` : "Hi,";
  const total = successCount + failedCount;

  // Mirror sendAuditReadyEmail's URL precedence so the CTA doesn't point at
  // localhost from a dev environment.
  const rawBase =
    process.env.EMAIL_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.NEXTAUTH_URL &&
    !/localhost|127\.0\.0\.1|0\.0\.0\.0|\.repl(\.co|it\.dev)/i.test(
      process.env.NEXTAUTH_URL,
    )
      ? process.env.NEXTAUTH_URL
      : null) ??
    "https://members.attractionbyvideo.com";
  const baseUrl = rawBase.replace(/\/$/, "");
  const marketDataUrl = `${baseUrl}/member/market-data`;
  const logoUrl = `${baseUrl}/logo.png`;

  const subject = failedCount > 0
    ? `Your market data upload finished with ${failedCount} error${failedCount === 1 ? "" : "s"}`
    : "Your market data upload is complete";

  // Collapse a long success list to a short summary; full list lives in the
  // members' upload-history table where they can act on it.
  const successBlock = (() => {
    if (succeededMonths.length === 0) return "";
    if (succeededMonths.length > 10) {
      return `
            <p style="margin:24px 0 8px;font-size:14px;font-weight:600;color:#1e2a38;">${succeededMonths.length} months validated</p>
            <p style="margin:0;font-size:13px;color:#374151;">From ${succeededMonths[0].label} through ${succeededMonths[succeededMonths.length - 1].label}.</p>
      `.trim();
    }
    const lines = succeededMonths
      .map(
        (m) =>
          `<li style="font-size:13px;color:#374151;line-height:1.8;"><strong>${m.label}</strong> <span style="color:#6b7280;">(${m.monthYear})</span></li>`,
      )
      .join("");
    return `
            <p style="margin:24px 0 8px;font-size:14px;font-weight:600;color:#1e2a38;">Validated</p>
            <ul style="margin:0;padding-left:20px;">${lines}</ul>
    `.trim();
  })();

  const failureBlock = (() => {
    if (failedUploads.length === 0) return "";
    const items = failedUploads
      .map(
        (f) => `
              <div style="margin-top:12px;padding:12px 14px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;">
                <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#991b1b;">${f.label} <span style="font-weight:400;color:#7f1d1d;">(${f.monthYear})</span></p>
                <p style="margin:0 0 4px;font-size:13px;color:#991b1b;font-weight:500;">${f.friendly.title}</p>
                <p style="margin:0;font-size:12px;color:#7f1d1d;line-height:1.5;">${f.friendly.body}</p>
              </div>
        `,
      )
      .join("");
    return `
            <p style="margin:24px 0 8px;font-size:14px;font-weight:600;color:#991b1b;">Needs attention</p>
            ${items}
            <p style="margin:16px 0 0;font-size:13px;color:#374151;">Open Market Data to retry any failed months.</p>
    `.trim();
  })();

  const summaryLine = failedCount > 0
    ? `Your ${total}-month backfill finished. <strong>${successCount} validated</strong>, ${failedCount} had errors.`
    : `Your ${total}-month backfill finished. All ${successCount} months validated successfully.`;

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f1f1ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f1ef;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="${logoUrl}" alt="Attraction by Video" width="200" style="display:block;width:200px;max-width:60%;height:auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:16px;padding:36px 32px;border:1px solid #e5e7eb;">
              <p style="margin:0 0 16px;font-size:15px;color:#1e2a38;">${greeting}</p>
              <p style="margin:0 0 8px;font-size:15px;color:#1e2a38;">${summaryLine}</p>

              ${successBlock}
              ${failureBlock}

              <div style="text-align:center;margin:28px 0 8px;">
                <a href="${marketDataUrl}" style="display:inline-block;background:#1e2a38;color:#ffffff;border-radius:100px;padding:14px 28px;font-weight:700;text-decoration:none;font-size:15px;">Open Market Data →</a>
              </div>

              <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">— The Attraction by Video Team</p>
            </td>
          </tr>
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
    console.error("[email] Failed to send backfill completion email:", error);
  }
}
