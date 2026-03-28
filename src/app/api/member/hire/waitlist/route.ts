import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendWaitlistNotification } from "@/lib/email";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await prisma.serviceWaitlistEntry.findMany({
    where: { userId: session.user.id },
    select: { packageId: true },
  });

  return NextResponse.json({ packageIds: entries.map((e) => e.packageId) });
}

async function sendSlackNotification(memberName: string, memberEmail: string, packageName: string, categoryName: string) {
  console.log("[hire] SLACK_WEBHOOK_URL:", process.env.SLACK_WEBHOOK_URL ? "SET" : "NOT SET");
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `*New Enquiry*\n${memberName} (${memberEmail}) is interested in *${packageName}* (${categoryName}) and would like to learn more.`,
      }),
    });
  } catch (e) {
    console.error("[hire] Slack notification failed:", e);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packageId } = await req.json();
  if (!packageId) {
    return NextResponse.json({ error: "packageId required" }, { status: 400 });
  }

  const pkg = await prisma.servicePackage.findUnique({
    where: { id: packageId },
    include: { category: true },
  });

  if (!pkg) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  let alreadyOnWaitlist = false;

  const existing = await prisma.serviceWaitlistEntry.findUnique({
    where: { packageId_userId: { packageId, userId: session.user.id } },
  });

  if (existing) {
    alreadyOnWaitlist = true;
  } else {
    await prisma.serviceWaitlistEntry.create({
      data: { packageId, userId: session.user.id },
    });

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { fullName: true, email: true },
    });

    const memberName = user?.fullName ?? "A member";
    const memberEmail = user?.email ?? (session.user as { email?: string }).email ?? "unknown";

    await Promise.allSettled([
      sendWaitlistNotification(memberName, memberEmail, pkg.name, pkg.category.name).catch((e) =>
        console.error("[hire] Email notification failed:", e)
      ),
      sendSlackNotification(memberName, memberEmail, pkg.name, pkg.category.name),
    ]);
  }

  return NextResponse.json({ success: true, alreadyOnWaitlist });
}
