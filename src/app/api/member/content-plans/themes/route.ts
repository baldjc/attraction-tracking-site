import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

interface ThemeObj {
  name: string;
  emoji?: string | null;
  colour?: string | null;
}

const DEFAULT_THEMES: ThemeObj[] = [
  { name: "Theme 1", emoji: null, colour: null },
  { name: "Theme 2", emoji: null, colour: null },
  { name: "Theme 3", emoji: null, colour: null },
  { name: "Theme 4", emoji: null, colour: null },
];

function extractTheme(t: unknown): ThemeObj | null {
  if (typeof t === "string") {
    const name = t.trim();
    return name ? { name, emoji: null, colour: null } : null;
  }
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
}

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { contentThemes: true },
  });

  const raw = dbUser?.contentThemes;
  let themes: ThemeObj[] = DEFAULT_THEMES;

  if (Array.isArray(raw) && raw.length > 0) {
    const extracted = raw.map(extractTheme).filter((t): t is ThemeObj => t !== null);
    if (extracted.length > 0) themes = extracted;
  }

  return NextResponse.json({ themes });
}
