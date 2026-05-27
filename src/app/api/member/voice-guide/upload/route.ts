// Ship B — Done-With-You member voice guide upload endpoint.
//
// POST: accepts either a `text` form field (raw markdown paste) or a `file`
// form field (.md / .txt / .docx / .pdf — text is extracted via the
// existing knowledge-base parser). Validates 500-50,000 chars and stores
// on MarketConfig.voiceGuide. Layer-2 override on top of the default voice
// register baked into script-builder-mode-prompt.ts.
//
// DELETE: nulls voiceGuide / voiceGuideUploadedAt / voiceGuideSourceFile so
// the member reverts to the default voice register.
//
// Auth: NextAuth session + `tool_member_voice_guide` feature flag. Admins
// bypass via getFeatureFlags() staff-role check. The spec referenced a
// `requireFeatureFlag` helper that does not exist in the codebase; the gate
// here mirrors `requireKnowledgeBaseAccess` exactly.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { extractTextFromUpload } from "@/lib/knowledge-base-parser";

export const runtime = "nodejs";
export const maxDuration = 60;

const MIN_CHARS = 500;
const MAX_CHARS = 50_000;

async function gate(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: Response }
> {
  const user = await resolveUserFromSession();
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const flags = await getFeatureFlags({ userId: user.id, userRole: user.role });
  if (!flags.tool_member_voice_guide) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, userId: user.id };
}

export async function POST(req: NextRequest) {
  const access = await gate();
  if (!access.ok) return access.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { error: "Expected multipart/form-data with `text` or `file` field." },
      { status: 400 },
    );
  }

  const textField = form.get("text");
  const fileField = form.get("file");

  let voiceGuide = "";
  let sourceFile: string | null = null;

  if (fileField instanceof File && fileField.size > 0) {
    sourceFile = fileField.name;
    try {
      voiceGuide = await extractTextFromUpload(fileField);
    } catch (e) {
      return Response.json(
        {
          error: `Could not read that file (${fileField.name}). ${(e as Error).message}`,
        },
        { status: 400 },
      );
    }
  } else if (typeof textField === "string") {
    voiceGuide = textField;
  }

  voiceGuide = voiceGuide.trim();
  if (voiceGuide.length < MIN_CHARS) {
    return Response.json(
      {
        error: `Voice guide must be at least ${MIN_CHARS} characters to be substantive enough to use.`,
      },
      { status: 400 },
    );
  }
  if (voiceGuide.length > MAX_CHARS) {
    return Response.json(
      {
        error: `Voice guide is too long (${MAX_CHARS.toLocaleString()} character max). Trim to operational rules — Claude can't use ${MAX_CHARS.toLocaleString()} characters of voice guidance effectively.`,
      },
      { status: 400 },
    );
  }

  // The member must already have a MarketConfig row before they can attach a
  // voice guide — the upload UI lives inside SetupForm, which only renders
  // after the form has been saved at least once. We `update` (not `upsert`)
  // on purpose: a missing config is a real bug we want to surface.
  try {
    await prisma.marketConfig.update({
      where: { userId: access.userId },
      data: {
        voiceGuide,
        voiceGuideUploadedAt: new Date(),
        voiceGuideSourceFile: sourceFile,
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "Set up your market first (Market name + MLS source) — then come back to upload a voice guide.",
      },
      { status: 409 },
    );
  }

  return Response.json({
    ok: true,
    charCount: voiceGuide.length,
    sourceFile,
    uploadedAt: new Date().toISOString(),
  });
}

export async function DELETE() {
  const access = await gate();
  if (!access.ok) return access.response;

  try {
    await prisma.marketConfig.update({
      where: { userId: access.userId },
      data: {
        voiceGuide: null,
        voiceGuideUploadedAt: null,
        voiceGuideSourceFile: null,
      },
    });
  } catch (e) {
    // Treat "no MarketConfig row to clear" (Prisma P2025) as a no-op success
    // since the end state matches what the caller wanted. Any other error is
    // a real fault — surface it as 500 instead of silently lying with 200.
    const code = (e as { code?: string } | null | undefined)?.code;
    if (code === "P2025") {
      return Response.json({ ok: true });
    }
    return Response.json(
      { error: "Could not clear voice guide. Try again." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
