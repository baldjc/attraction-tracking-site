import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { logUsage, checkCostCap } from "@/lib/ai-tool-cost";
import { getAvatarData } from "@/lib/avatar-utils";
import { buildListingVideoPrompt } from "@/lib/listing-video-builder-prompt";
import { getFeatureFlags } from "@/lib/feature-flags";
import { isListingVideoBuilderTester } from "@/lib/listing-video-builder-access";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-5";

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Gate: admins and editors always pass; members need the flag or be on the allowlist
  if (user.role !== "admin" && user.role !== "editor") {
    const flags = await getFeatureFlags();
    const allowed =
      flags.tool_listing_video_builder === true ||
      isListingVideoBuilderTester(user.email);
    if (!allowed) {
      return NextResponse.json({ error: "Not available" }, { status: 403 });
    }
  }

  const capCheck = await checkCostCap(user.id);
  if (!capCheck.allowed) {
    return NextResponse.json(
      { error: "monthly_cap_reached", resetsAt: capCheck.resetsAt },
      { status: 429 }
    );
  }

  const body = await req.json();
  const {
    propertyAddress,
    price,
    propertyType,
    keyFeatures,
    neighbourhoodHighlights,
    mlsRemarks,
    creatorOpinion,
    extractedFileText,
    messages,
  } = body;

  if (!propertyAddress || !price || !propertyType) {
    return NextResponse.json({ error: "Missing required property fields" }, { status: 400 });
  }

  const avatar = await getAvatarData(user.id);

  const systemPrompt = buildListingVideoPrompt({
    avatarProfile: avatar.avatarProfile ?? null,
    contentThemes: avatar.contentThemes ?? null,
    niche: avatar.niche ?? null,
    city: avatar.city ?? null,
    propertyDetails: {
      address: propertyAddress,
      price,
      propertyType,
      keyFeatures,
      neighbourhoodHighlights,
      mlsRemarks,
      creatorOpinion,
      extractedFileText,
    },
  });

  const chatMessages: Array<{ role: "user" | "assistant"; content: string }> = messages?.length
    ? messages
    : [
        {
          role: "user",
          content: `Please generate 3 video concept options for this listing:

Property: ${propertyAddress}
Price: ${price}
Type: ${propertyType}
${keyFeatures ? `Key Features: ${keyFeatures}` : ""}
${neighbourhoodHighlights ? `Neighbourhood: ${neighbourhoodHighlights}` : ""}
${mlsRemarks ? `MLS Remarks: ${mlsRemarks}` : ""}
${creatorOpinion ? `Creator Notes: ${creatorOpinion}` : ""}
${extractedFileText ? `Additional Info:\n${extractedFileText}` : ""}`,
        },
      ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: chatMessages,
  });

  await logUsage(user.id, "listing_video_builder", response.usage.input_tokens, response.usage.output_tokens);

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return NextResponse.json({ message: text });
}
