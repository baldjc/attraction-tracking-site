import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function checkAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  return session?.user && (role === "admin" || role === "editor") ? session : null;
}

const DEFAULT_THEMES = ["Theme 1", "Theme 2", "Theme 3", "Theme 4"];

function extractThemeName(t: unknown): string | null {
  if (typeof t === "string") return t.trim() || null;
  if (t && typeof t === "object") {
    const obj = t as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim() : null;
    return name || null;
  }
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const member = await prisma.user.findUnique({
    where: { id },
    select: { contentThemes: true },
  });

  const raw = member?.contentThemes;
  let themes: string[] = DEFAULT_THEMES;

  if (Array.isArray(raw) && raw.length > 0) {
    const extracted = raw.map(extractThemeName).filter((t): t is string => t !== null);
    if (extracted.length > 0) themes = extracted;
  }

  return NextResponse.json({ themes });
}
