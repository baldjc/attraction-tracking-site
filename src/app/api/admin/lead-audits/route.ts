import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor } from "@/lib/auth-utils";

export async function GET() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Lead Audits = one row per AuditRequest that has been audited. Sourcing
  // from AuditRequest (not Audit/User) keeps the row identity tied to the
  // original request, so multiple leads sharing an email never collapse onto
  // a single user-owned audit.
  const requests = await prisma.auditRequest.findMany({
    where: { auditId: { not: null } },
    orderBy: { createdAt: "desc" },
    include: {
      audit: {
        select: {
          id: true,
          auditType: true,
          overallScore: true,
          createdAt: true,
          videosAnalysed: true,
          youtubeVideoId: true,
        },
      },
    },
  });

  // AuditRequest has no `user` relation in the schema (only `userId`), so
  // fetch matching users separately and zip them in.
  const userIds = Array.from(
    new Set(
      requests
        .map((r) => r.userId)
        .filter((id): id is string => typeof id === "string"),
    ),
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          leadStatus: true,
          serviceTier: true,
          youtubeChannelThumbnail: true,
          youtubeChannelName: true,
        },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  // Shape: keep `audit.*` as the row's primary id (so the existing UI links
  // like /admin/audits/{id} still work) but surface the AuditRequest's own
  // fullName/youtubeChannelUrl as the displayed lead identity.
  const audits = requests
    .filter((r) => r.audit) // defensive — auditId set but audit deleted
    .map((r) => {
      const u = r.userId ? userById.get(r.userId) ?? null : null;
      return {
        id: r.audit!.id,
        auditType: r.audit!.auditType,
        overallScore: r.audit!.overallScore,
        createdAt: r.audit!.createdAt,
        youtubeVideoId: r.audit!.youtubeVideoId,
        videosAnalysed: r.audit!.videosAnalysed,
        auditRequestId: r.id,
        leadFullName: r.fullName,
        leadEmail: r.email,
        leadYoutubeChannelUrl: r.youtubeChannelUrl,
        user: u
          ? {
              id: u.id,
              fullName: r.fullName, // prefer the request's own name
              email: u.email,
              role: u.role,
              leadStatus: u.leadStatus,
              youtubeChannelThumbnail: u.youtubeChannelThumbnail,
              youtubeChannelName: u.youtubeChannelName,
            }
          : null,
      };
    });

  return NextResponse.json({ audits });
}
