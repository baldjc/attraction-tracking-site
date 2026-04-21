import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { logUsage, checkCostCap } from "@/lib/ai-tool-cost";
import { DESCRIPTION_GENERATOR_PROMPT } from "@/lib/description-generator-prompt";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed } = await checkCostCap(user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Monthly usage limit reached. Resets next month." }, { status: 429 });
  }

  const { title, transcript, trackingUrl, contentPlanId } = await req.json();
  if (!title || !transcript) {
    return NextResponse.json({ error: "Title and transcript are required" }, { status: 400 });
  }
  if (transcript.length > 80000) {
    return NextResponse.json({ error: "Transcript exceeds 80,000 character limit" }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      avatarProfile: true,
      descriptionBoilerplate: true,
      fullName: true,
      youtubeChannelName: true,
    },
  });

  const avatarText = dbUser?.avatarProfile
    ? typeof dbUser.avatarProfile === "string"
      ? dbUser.avatarProfile
      : JSON.stringify(dbUser.avatarProfile)
    : "No avatar profile saved. Use generic real estate buyer language.";

  const boilerplateText = dbUser?.descriptionBoilerplate || "";
  const creatorName = dbUser?.fullName || "the creator";
  const brandName = dbUser?.youtubeChannelName || creatorName;

  const userMessage = `VIDEO TITLE: "${title}"

CREATOR NAME (for semantic triples and AI indexing): ${creatorName}
BRAND/CHANNEL NAME (for branded hashtag): ${brandName}

LANDING PAGE URL: ${trackingUrl || "No tracking URL provided — omit the URL from line 1 but still write the hook."}

AVATAR PROFILE:
${avatarText}

BOILERPLATE TO APPEND:
${boilerplateText || "No boilerplate saved — skip Section 4."}

TRANSCRIPT:
${transcript}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: DESCRIPTION_GENERATOR_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  await logUsage(
    user.id,
    "description_generator",
    response.usage.input_tokens,
    response.usage.output_tokens,
  );

  const description = response.content[0].type === "text" ? response.content[0].text : "";

  if (contentPlanId) {
    try {
      await prisma.contentPlan.update({
        where: { id: contentPlanId, userId: user.id },
        data: { youtubeDescription: description },
      });
    } catch {
      // Content plan might not exist or not belong to user — silently skip
    }
  }

  return NextResponse.json({ description });
}
