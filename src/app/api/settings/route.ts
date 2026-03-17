import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  DEFAULT_SCORING_PROMPT,
  SCRIPT_REVIEW_PROMPT,
  SCRIPT_REVIEW_CHAT_SYSTEM_PROMPT,
  AVATAR_ARCHITECT_PROMPT,
  TITLE_CREATOR_PROMPT,
  TITLE_THUMBNAIL_ANALYZER_PROMPT,
} from "@/lib/audit-engine";
import { ARC_MASTER_SYSTEM_PROMPT } from "@/lib/arc-script-builder-prompt";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get("key") ?? "audit_prompt";

  const setting = await prisma.appSetting.findUnique({ where: { key } });

  const PROMPT_DEFAULTS: Record<string, string> = {
    audit_prompt: DEFAULT_SCORING_PROMPT,
    script_review_analysis_prompt: SCRIPT_REVIEW_PROMPT,
    script_review_chat_prompt: SCRIPT_REVIEW_CHAT_SYSTEM_PROMPT,
    avatar_architect_prompt: AVATAR_ARCHITECT_PROMPT,
    title_creator_prompt: TITLE_CREATOR_PROMPT,
    title_thumbnail_analyzer_prompt: TITLE_THUMBNAIL_ANALYZER_PROMPT,
    prompt_arc_script_builder: ARC_MASTER_SYSTEM_PROMPT,
    content_engine_prompt: "",
  };

  const defaultValue = PROMPT_DEFAULTS[key] ?? null;

  return NextResponse.json({
    value: setting?.value ?? defaultValue,
    ...(key === "audit_prompt" ? { audit_prompt: setting?.value ?? DEFAULT_SCORING_PROMPT } : {}),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const key = body.key ?? "audit_prompt";
  const value = body.value ?? body.audit_prompt;

  if (!key || value === undefined) {
    return NextResponse.json({ error: "Missing key or value" }, { status: 400 });
  }

  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  await prisma.appSetting.deleteMany({ where: { key } });

  return NextResponse.json({ success: true });
}
