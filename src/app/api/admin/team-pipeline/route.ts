import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const PRODUCTION_TIERS = ["editing_2", "editing_4", "mastery_2", "mastery_4", "done_with_you"];

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
  if (status.length) where.status = { in: status };
  if (memberId.length) where.userId = { in: memberId };
  if (assignedTo.length) {
    where.assignedUserId = assignedTo.includes("__unassigned__")
      ? { in: [...assignedTo.filter((v) => v !== "__unassigned__"), null] as unknown as string[] }
      : { in: assignedTo };
  }
  if (shootBefore) where.shootDate = { lte: new Date(shootBefore) };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { theme: { contains: search, mode: "insensitive" } },
      { user: { fullName: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

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
