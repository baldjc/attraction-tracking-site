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

    try {
      await sendWaitlistNotification(
        user?.fullName ?? "A member",
        user?.email ?? session.user.email ?? "unknown",
        pkg.name,
        pkg.category.name
      );
    } catch (e) {
      console.error("[waitlist] Email notification failed:", e);
    }
  }

  return NextResponse.json({ success: true, alreadyOnWaitlist });
}
