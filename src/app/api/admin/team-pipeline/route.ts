import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const PRODUCTION_TIERS = ["production", "growth", "done_with_you"];

async function requireStaff() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || (role !== "admin" && role !== "editor")) return null;
  return { session, role: role! };
}

export async function GET(req: NextRequest) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.getAll("status");
  const memberId = searchParams.getAll("memberId");
  const assignedTo = searchParams.getAll("assignedTo");
  const shootBefore = searchParams.get("shootDateBefore");
  const search = searchParams.get("search");
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") || "50")));

  const where: Record<string, unknown> = {
    user: { serviceTier: { in: PRODUCTION_TIERS } },
  };
  const andClauses: Array<Record<string, unknown>> = [];
  if (status.length) where.status = { in: status };
  if (memberId.length) where.userId = { in: memberId };
  if (assignedTo.length) {
    const hasUnassigned = assignedTo.includes("__unassigned__");
    const userIds = assignedTo.filter((v) => v !== "__unassigned__");
    if (hasUnassigned && userIds.length) {
      andClauses.push({ OR: [{ assignedUserId: { in: userIds } }, { assignedUserId: null }] });
    } else if (hasUnassigned) {
      where.assignedUserId = null;
    } else {
      where.assignedUserId = { in: userIds };
    }
  }
  if (shootBefore) {
    const d = new Date(shootBefore);
    if (!isNaN(d.getTime())) where.shootDate = { lte: d };
  }
  if (search) {
    andClauses.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { theme: { contains: search, mode: "insensitive" } },
        { user: { fullName: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ],
    });
  }
  // Soft-deleted plans never appear in the staff production pipeline.
  where.deletedAt = null;
  if (andClauses.length) where.AND = andClauses;

  const [plans, total] = await Promise.all([
    prisma.contentPlan.findMany({
      where,
      orderBy: [{ shootDate: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: { id: true, fullName: true, email: true, serviceTier: true, youtubeChannelThumbnail: true },
        },
        assignedUser: { select: { id: true, fullName: true, email: true } },
        artifacts: {
          select: { id: true, type: true, content: true, metadata: true, version: true, generatedAt: true },
          orderBy: { generatedAt: "desc" },
        },
      },
    }),
    prisma.contentPlan.count({ where }),
  ]);

  const shaped = plans.map((p) => {
    const artifactCounts: Record<string, number> = {};
    let latestScriptReview: number | null = null;
    for (const a of p.artifacts) {
      artifactCounts[a.type] = (artifactCounts[a.type] || 0) + 1;
      if (a.type === "script_review" && latestScriptReview === null) {
        const meta = a.metadata as { score?: number } | null;
        if (meta?.score != null) latestScriptReview = meta.score;
      }
    }
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      theme: p.theme,
      shootDate: p.shootDate,
      publishDate: p.publishDate,
      editDueDate: p.editDueDate,
      priority: p.priority,
      driveFolderLink: p.driveFolderLink,
      footageLink: p.footageLink,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      member: {
        id: p.user.id,
        name: p.user.fullName || p.user.email,
        email: p.user.email,
        serviceTier: p.user.serviceTier,
        avatarUrl: p.user.youtubeChannelThumbnail,
      },
      assignedUserId: p.assignedUserId,
      assignedUser: p.assignedUser
        ? { id: p.assignedUser.id, name: p.assignedUser.fullName || p.assignedUser.email, email: p.assignedUser.email }
        : null,
      artifactCounts,
      latestScriptReviewScore: latestScriptReview,
    };
  });

  return NextResponse.json({ plans: shaped, total, page, pageSize });
}
