import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

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

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { contentThemes: true },
  });

  const raw = dbUser?.contentThemes;
  let themes: string[] = DEFAULT_THEMES;

  if (Array.isArray(raw) && raw.length > 0) {
    const extracted = raw.map(extractThemeName).filter((t): t is string => t !== null);
    if (extracted.length > 0) themes = extracted;
  }

  return NextResponse.json({ themes });
}
