import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { CANONICAL_THEMES } from "@/lib/canonical-themes";

interface ThemeObj {
  name: string;
  emoji?: string | null;
  colour?: string | null;
  // The avatar's worry behind this Avatar Stressor (the question the member
  // answers in the body). Surfaced so pickers can label each Stressor by its
  // question, and so the Script Builder can acknowledge it.
  coreStress?: string | null;
  // Per-Stressor buy-side title enforcement (defaults ON only for "The Equity").
  enforceBuySideTitles?: boolean;
}

// Fallback when a member has not run the Avatar Architect yet: present the FULL
// canonical 8 Avatar Stressors (not a hard-coded 4), each carrying its question
// and the canonical buy-side default ("The Equity" only).
const DEFAULT_THEMES: ThemeObj[] = CANONICAL_THEMES.map((t) => ({
  name: t.name,
  emoji: t.emoji,
  colour: t.colour,
  coreStress: t.coreStress,
  enforceBuySideTitles: t.name === "The Equity",
}));

const PINNED_THEMES: ThemeObj[] = [
  { name: "Monthly Market Update", emoji: "📊", colour: null },
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
      coreStress: typeof obj.coreStress === "string" ? obj.coreStress : null,
      enforceBuySideTitles:
        typeof obj.enforceBuySideTitles === "boolean"
          ? obj.enforceBuySideTitles
          : undefined,
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

  const allThemes = [
    ...themes,
    ...PINNED_THEMES.filter((p) => !themes.some((t) => t.name === p.name)),
  ];

  return NextResponse.json({ themes: allThemes });
}
