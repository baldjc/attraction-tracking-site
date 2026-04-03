import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function checkAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return session?.user && (role === "admin" || role === "editor") ? session : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [plans, member] = await Promise.all([
    prisma.contentPlan.findMany({
      where: { userId: id },
      orderBy: { publishDate: "desc" },
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
  const body = await req.json();
  const { title, status, theme, shootDate, publishDate, editDueDate, priority, notes, thumbnailWords, footageLink } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

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
      thumbnailWords: thumbnailWords ?? null,
      footageLink: footageLink ?? null,
    },
  });

  return NextResponse.json({ plan }, { status: 201 });
}
