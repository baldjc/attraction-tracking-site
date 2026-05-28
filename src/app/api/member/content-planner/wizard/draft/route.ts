/**
 * Wave 4 — Content Engine wizard draft persistence.
 *
 *   GET     /api/member/content-planner/wizard/draft
 *     → { draft: {...} | null }. Returns the caller's MOST RECENT in-progress
 *       draft (multi-draft, Wave 4 beta — Finding 12). Sweeps expired drafts.
 *
 *   POST    /api/member/content-planner/wizard/draft
 *     → creates a NEW draft for the caller and returns it (with id). The
 *       client (WizardDraftShell) is expected to hold onto the id and use
 *       PATCH /draft/[id] for subsequent autosaves so it doesn't spam the
 *       drafts table with one row per URL change.
 *
 *   DELETE  /api/member/content-planner/wizard/draft
 *     → discards ALL of the caller's drafts (idempotent). Per-draft delete
 *       lives at /draft/[id] (Finding 11).
 *
 * Flag-gated on tool_content_engine_v2.
 */
import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { parsePropertyTypeFocus } from "@/lib/property-type-focus";
import { deriveLeadPropertyTypeLock } from "@/lib/content-engine-context";

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
  // Impersonation-aware so wizard drafts are owned by the impersonated
  // member, not the admin account, during admin/editor impersonation.
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const userId = resolved.id;
  const userRole = resolved.role;
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

  // Delete-on-read cleanup for ALL users' expired drafts (cheap, indexed
  // on expiresAt) — lets us skip a separate cron sweep job.
  const now = new Date();
  // User-scoped — never widen without auth review. (The `expiresAt < now`
  // filter is intentionally global: anyone's expired row can be reaped.
  // Member-owned data deletions live in the per-id route + the
  // user-scoped DELETE below.)
  await prisma.contentEngineDraft.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  // Multi-draft (Finding 12): return the caller's most recent active draft.
  const draft = await prisma.contentEngineDraft.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
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
  let focusForDb = focus === "Any" ? null : focus;

  // Wave 12 Fix 2 — Story Lead → property-type auto-lock. When the
  // member picks a Story Lead and hasn't already explicitly locked a
  // property type, derive the lock from the lead's hood-anchored
  // facts. Sets leadSpansMultipleTypes when no single type owns ≥80%
  // of those facts so the BUYER AUDIENCE CONSISTENCY hard rule can
  // honour the dual-audience exception downstream.
  const storyLeadId =
    typeof body.storyLeadId === "string" ? body.storyLeadId : null;
  let leadSpansMultipleTypes = false;
  if (storyLeadId) {
    const derived = await deriveLeadPropertyTypeLock(userId, storyLeadId);
    if (derived) {
      if (focusForDb == null && derived.propertyTypeFocus) {
        focusForDb = derived.propertyTypeFocus;
      }
      leadSpansMultipleTypes = derived.leadSpansMultipleTypes;
    }
  }

  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);

  // Wave 4 beta — Finding 11: POST always creates a NEW draft. The client
  // is responsible for holding the returned id and PATCH-ing subsequent
  // updates against /draft/[id]. Two browser tabs → two POSTs → two
  // independent drafts in My Work, exactly as members expect.
  const draft = await prisma.contentEngineDraft.create({
    data: {
      userId,
      currentStep: body.currentStep,
      propertyTypeFocus: focusForDb,
      storyLeadId,
      leadSpansMultipleTypes,
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
    },
  });

  return NextResponse.json({ draft });
}

export async function DELETE() {
  const gate = await gateOrError();
  if ("error" in gate) return gate.error;
  const { userId } = gate;

  // User-scoped — never widen without auth review.
  await prisma.contentEngineDraft.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}
