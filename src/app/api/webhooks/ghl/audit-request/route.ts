import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type WebhookStatus =
  | "success"
  | "deduplicated"
  | "rejected_bad_token"
  | "rejected_missing_fields"
  | "error";

async function logWebhook(
  status: WebhookStatus,
  payload: unknown,
  message?: string,
  email?: string,
) {
  try {
    await prisma.webhookLog.create({
      data: {
        source: "ghl_audit_request",
        status,
        email: email ?? null,
        message: message ?? null,
        payload: (payload ?? {}) as any,
      },
    });
  } catch (e) {
    console.error("[webhook log] failed to write:", e);
  }
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const secret = process.env.GHL_WEBHOOK_SECRET;

  // Read body first so we can log it no matter what.
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    await logWebhook("error", { raw: "non-JSON body" }, "Invalid JSON payload");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!secret || token !== secret) {
    await logWebhook("rejected_bad_token", body, "Missing or invalid ?token= param");
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const contact = body.contact ?? {};

  const fullName =
    body.full_name ?? contact.name ?? body.name ?? "";
  const email =
    body.email ?? contact.email ?? "";
  const phone =
    body.phone ?? contact.phone ?? null;
  const youtubeChannelUrl =
    body.youtube_channel_url ?? contact.youtube_channel_url ?? "";
  const currentYoutubeIncome =
    body.Current_YouTube_Commission ?? contact.Current_YouTube_Commission ?? null;
  const desiredYoutubeIncome =
    body.Desired_YouTube_Commission ?? contact.Desired_YouTube_Commission ?? null;

  const missing: string[] = [];
  if (!email) missing.push("email");
  if (!youtubeChannelUrl) missing.push("youtube_channel_url");

  if (missing.length) {
    await logWebhook(
      "rejected_missing_fields",
      body,
      `Missing required field(s): ${missing.join(", ")}`,
      email || undefined,
    );
    return NextResponse.json(
      {
        error: "Missing required fields",
        missing,
        hint: "This form must collect email and youtube_channel_url before firing the webhook.",
      },
      { status: 400 },
    );
  }

  const existing = await prisma.auditRequest.findFirst({
    where: { email, status: "pending" },
  });

  if (existing) {
    await logWebhook("deduplicated", body, "Pending request already exists for this email", email);
    return NextResponse.json({ ok: true, deduplicated: true });
  }

  await prisma.auditRequest.create({
    data: {
      fullName: fullName || email,
      email,
      phone,
      youtubeChannelUrl,
      currentYoutubeIncome,
      desiredYoutubeIncome,
    },
  });

  await logWebhook("success", body, "AuditRequest created", email);
  return NextResponse.json({ ok: true });
}
