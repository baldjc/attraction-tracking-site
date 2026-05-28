import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canStaffAccessMember } from "@/lib/staff-access";
import { PRODUCTION_TIERS, PRE_PRODUCTION_STATUSES } from "@/lib/content-plan-utils";
import { createVideoFolder } from "@/lib/google-drive";

async function checkAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return session?.user && (role === "admin" || role === "editor") ? session : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [plans, member] = await Promise.all([
    prisma.contentPlan.findMany({
      where: { userId: id },
      orderBy: { publishDate: "desc" },
      include: {
        // Surface the binge chain summaries so the admin planner table + edit
        // modal can render the chip and "Binged FROM" list without an extra
        // roundtrip per plan.
        bingeVideo: { select: { id: true, title: true, theme: true, status: true } },
        bingedFromList: {
          select: { id: true, title: true, theme: true, status: true },
          orderBy: { updatedAt: "desc" },
        },
      },
    }),
    prisma.user.findUnique({ where: { id }, select: { serviceTier: true, contentThemes: true } }),
  ]);

  const raw = member?.contentThemes;
  let themes: Array<{ name: string; emoji: string | null; colour: string | null }> = [];
  if (Array.isArray(raw) && raw.length > 0) {
    const extracted = raw.map((t: unknown) => {
      if (typeof t === "string") return t.trim() ? { name: t.trim(), emoji: null, colour: null } : null;
      if (t && typeof t === "object") {
        const obj = t as Record<string, unknown>;
        const name = typeof obj.name === "string" ? obj.name.trim() : null;
        if (!name) return null;
        return {
          name,
          emoji: typeof obj.emoji === "string" ? obj.emoji : null,
          colour: typeof obj.colour === "string" ? obj.colour : null,
        };
      }
      return null;
    }).filter((t): t is { name: string; emoji: string | null; colour: string | null } => t !== null);
    if (extracted.length > 0) themes = extracted;
  }

  return NextResponse.json({ plans, serviceTier: member?.serviceTier ?? "foundations", themes });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const { title, status, theme, shootDate, publishDate, editDueDate, priority, notes, script, thumbnailWords, footageLink } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const member = await prisma.user.findUnique({
    where: { id },
    select: { serviceTier: true, fullName: true, assetsDriveLink: true },
  });

  const plan = await prisma.contentPlan.create({
    data: {
      userId: id,
      title: title.trim(),
      status: status ?? "Idea",
      theme: theme ?? null,
      shootDate: shootDate ? new Date(shootDate) : null,
      publishDate: publishDate ? new Date(publishDate) : null,
      editDueDate: editDueDate ? new Date(editDueDate) : null,
      priority: priority ?? null,
      notes: notes ?? null,
      script: script ?? null,
      thumbnailWords: thumbnailWords ?? null,
      footageLink: footageLink ?? null,
    },
  });

  // Auto-create Google Drive folder for Production/Growth/DWY members. Folders
  // spin up either when the plan is in production (Ready to Shoot or beyond)
  // OR when the plan starts at "Needs Research" — so members can drop research
  // links into the seeded "Video Research" doc from day one.
  const shouldCreateFolder =
    plan.status === "Needs Research" || !PRE_PRODUCTION_STATUSES.includes(plan.status);
  if (member && PRODUCTION_TIERS.includes(member.serviceTier ?? "") && member.fullName && shouldCreateFolder) {
    try {
      const { videoFolderUrl, memberFolderUrl } = await createVideoFolder(member.fullName, plan.title);
      const updates: Promise<unknown>[] = [
        prisma.contentPlan.update({ where: { id: plan.id }, data: { driveFolderLink: videoFolderUrl } }),
      ];
      if (!member.assetsDriveLink) {
        updates.push(prisma.user.update({ where: { id }, data: { assetsDriveLink: memberFolderUrl } }));
      }
      await Promise.all(updates);
      (plan as any).driveFolderLink = videoFolderUrl;
    } catch (err) {
      console.error("[admin content-plans] Drive folder creation failed:", err);
    }
  }

  return NextResponse.json({ plan }, { status: 201 });
}
