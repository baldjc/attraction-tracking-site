/**
 * Wave 4 — Content Engine wizard draft persistence.
 *
 *   GET     /api/member/content-planner/wizard/draft
 *     → { draft: {...} | null }. Sweeps expired drafts (delete-on-read).
 *
 *   POST    /api/member/content-planner/wizard/draft
 *     → upserts the caller's single draft. Resets expiresAt to now+14d.
 *
 *   DELETE  /api/member/content-planner/wizard/draft
 *     → discards the caller's draft (idempotent).
 *
 * One row per user (unique on userId). Flag-gated on tool_content_engine_v2.
 */
import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/feature-flags";
import { parsePropertyTypeFocus } from "@/lib/property-type-focus";

export const runtime = "nodejs";

const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

interface DraftBody {
  currentStep?: string;
  propertyTypeFocus?: string | null;
  storyLeadId?: string | null;
  rotationSlot?: string | null;
  validatedIdea?: string | null;
  storyLeadFactIds?: unknown;
  generatedIdeaCards?: unknown;
  validationContext?: unknown;
  pickedKey?: string | null;
}

const KNOWN_STEPS = new Set(["1", "2a", "2b", "2c", "3", "4"]);

async function gateOrError() {
  const session = await auth();
  const userId = session?.user?.id;
  const userRole = session?.user?.role ?? null;
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_content_engine_v2) {
    return { error: NextResponse.json({ error: "Not enabled" }, { status: 404 }) };
  }
  return { userId };
}

export async function GET() {
  const gate = await gateOrError();
  if ("error" in gate) return gate.error;
  const { userId } = gate;

  // Delete-on-read cleanup for THIS user's expired draft.
  // We also opportunistically sweep any other expired rows so the table
  // doesn't accumulate dead drafts — cheap (indexed on expiresAt) and lets
  // us skip a separate cron.
  const now = new Date();
  await prisma.contentEngineDraft.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  const draft = await prisma.contentEngineDraft.findUnique({
    where: { userId },
  });
  return NextResponse.json({ draft });
}

export async function POST(req: NextRequest) {
  const gate = await gateOrError();
  if ("error" in gate) return gate.error;
  const { userId } = gate;

  let body: DraftBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.currentStep || !KNOWN_STEPS.has(body.currentStep)) {
    return NextResponse.json(
      { error: "invalid_current_step" },
      { status: 400 },
    );
  }

  // Whitelist propertyTypeFocus (null/"Any" both collapse to null in DB).
  const focus = parsePropertyTypeFocus(body.propertyTypeFocus ?? null);
  const focusForDb = focus === "Any" ? null : focus;

  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);

  const data = {
    currentStep: body.currentStep,
    propertyTypeFocus: focusForDb,
    storyLeadId: typeof body.storyLeadId === "string" ? body.storyLeadId : null,
    rotationSlot: typeof body.rotationSlot === "string" ? body.rotationSlot : null,
    validatedIdea:
      typeof body.validatedIdea === "string"
        ? body.validatedIdea.slice(0, 2000)
        : null,
    storyLeadFactIds: (body.storyLeadFactIds ?? null) as never,
    generatedIdeaCards: (body.generatedIdeaCards ?? null) as never,
    validationContext: (body.validationContext ?? null) as never,
    pickedKey: typeof body.pickedKey === "string" ? body.pickedKey : null,
    expiresAt,
  };

  const draft = await prisma.contentEngineDraft.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  return NextResponse.json({ draft });
}

export async function DELETE() {
  const gate = await gateOrError();
  if ("error" in gate) return gate.error;
  const { userId } = gate;

  await prisma.contentEngineDraft.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}
