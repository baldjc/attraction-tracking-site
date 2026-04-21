import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/client";
import { staffMemberIdFilter } from "@/lib/staff-access";

export async function GET() {
  const session = await auth();
  const sessionUser = session?.user as { id?: string; role?: string } | undefined;
  const role = sessionUser?.role;
  const userId = sessionUser?.id;
  if (!session?.user || (role !== "admin" && role !== "editor") || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Honors impersonation: when admin views as Staff Admin, applies that
  // editor's allowedMemberIds scope. Returns undefined for unrestricted access.
  const memberScope = await staffMemberIdFilter(userId);

  const [audits, recentUsers, waitlist] = await Promise.all([
    prisma.audit.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, ...(memberScope ? { userId: memberScope } : {}) },
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.user.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        role: { in: [UserRole.foundations_member] },
        ...(memberScope ? { id: memberScope } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, fullName: true, email: true, createdAt: true },
    }),
    prisma.serviceWaitlistEntry.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, ...(memberScope ? { userId: memberScope } : {}) },
      include: {
        user: { select: { fullName: true } },
        package: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const activities = [
    ...audits.map((a) => ({
      type: "audit_complete",
      title: `Audit completed for ${a.user?.fullName || a.user?.email || "Unknown"}`,
      description: `${a.auditType} audit — Score: ${a.overallScore?.toFixed(1) ?? "—"}/10`,
      timestamp: a.createdAt.toISOString(),
      link: `/admin/audits/${a.id}`,
    })),
    ...recentUsers.map((u) => ({
      type: "member_signup",
      title: `${u.fullName || u.email} joined`,
      description: "New member signup",
      timestamp: u.createdAt.toISOString(),
      link: `/admin/members/${u.id}`,
    })),
    ...waitlist.map((w) => ({
      type: "waitlist_entry",
      title: `${w.user?.fullName || "Someone"} joined waitlist`,
      description: `Package: ${w.package?.name || "Unknown"}`,
      timestamp: w.createdAt.toISOString(),
      link: "/admin/hire",
    })),
  ];

  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json({ activities: activities.slice(0, 15) });
}
