import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const planId = searchParams.get("planId");

  let draft = null;
  if (id) {
    draft = await prisma.scriptDraft.findFirst({ where: { id, userId: user.id } });
  } else if (planId) {
    // Strict: only resume the draft that belongs to this plan. If none exists,
    // return null so the builder can start fresh from the plan's prefill.
    draft = await prisma.scriptDraft.findFirst({
      where: { userId: user.id, planId },
      orderBy: { updatedAt: "desc" },
    });
  } else {
    // No plan context — fall back to the user's most recent draft.
    draft = await prisma.scriptDraft.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
  }

  return NextResponse.json({ draft: draft ?? null });
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch (e: any) {
    console.error("[draft POST] failed to parse body", { userId: user.id, err: e?.message });
    return NextResponse.json({ error: "invalid_json", detail: e?.message ?? "could not parse body" }, { status: 400 });
  }

  const { videoTitle, planId, initialData, messages, currentSection, completedSections, sectionApprovals } = body;

  if (!videoTitle || typeof videoTitle !== "string") {
    return NextResponse.json({ error: "videoTitle required" }, { status: 400 });
  }

  const planIdValue: string | null = typeof planId === "string" && planId.length > 0 ? planId : null;

  // Sanitize: ensure JSON-typed fields are the right shape so Prisma never
  // chokes on unexpected payloads (e.g. undefined nested values).
  const safeInitialData = initialData && typeof initialData === "object" ? initialData : {};
  const safeMessages = Array.isArray(messages) ? messages : [];
  const safeCompleted = Array.isArray(completedSections) ? completedSections : [];
  const safeApprovals = Array.isArray(sectionApprovals) ? sectionApprovals : [];
  const safeCurrentSection = typeof currentSection === "string" && currentSection.length > 0
    ? currentSection
    : "research_strategy";

  try {
    const draft = await prisma.scriptDraft.upsert({
      where: { userId_videoTitle: { userId: user.id, videoTitle } },
      create: {
        userId: user.id,
        videoTitle,
        planId: planIdValue,
        initialData: safeInitialData,
        messages: safeMessages,
        currentSection: safeCurrentSection,
        completedSections: safeCompleted,
        sectionApprovals: safeApprovals,
      },
      update: {
        // Only overwrite planId when the caller actually provided one — never
        // unlink a draft from its plan on a subsequent save that omitted planId.
        ...(planIdValue !== null ? { planId: planIdValue } : {}),
        initialData: safeInitialData,
        messages: safeMessages,
        currentSection: safeCurrentSection,
        completedSections: safeCompleted,
        sectionApprovals: safeApprovals,
      },
    });

    return NextResponse.json({ id: draft.id });
  } catch (e: any) {
    const payloadBytes = JSON.stringify(body ?? {}).length;
    console.error("[draft POST] upsert failed", {
      userId: user.id,
      videoTitle,
      planId: planIdValue,
      messageCount: safeMessages.length,
      payloadBytes,
      code: e?.code,
      name: e?.name,
      message: e?.message,
    });
    return NextResponse.json(
      { error: "draft_save_failed", code: e?.code ?? null, detail: e?.message ?? "unknown" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const videoTitle = searchParams.get("videoTitle");

  if (id) {
    await prisma.scriptDraft.deleteMany({ where: { id, userId: user.id } });
  } else if (videoTitle) {
    await prisma.scriptDraft.deleteMany({ where: { userId: user.id, videoTitle } });
  } else {
    return NextResponse.json({ error: "id or videoTitle required" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
