import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

const DEFAULT_THEMES = ["Theme 1", "Theme 2", "Theme 3", "Theme 4"];

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
    themes = raw.filter((t) => typeof t === "string");
  }

  return NextResponse.json({ themes });
}
