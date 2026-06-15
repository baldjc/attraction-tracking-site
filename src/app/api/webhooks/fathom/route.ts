import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import prisma from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { PRINCIPLES } from "@/app/api/admin/resources/lessons/route";
import { SONNET_MODEL } from "@/lib/ai-models";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

async function getSetting(key: string): Promise<string | null> {
  const s = await prisma.appSetting.findUnique({ where: { key } });
  return s?.value ?? null;
}

// Verify Fathom webhook signature (HMAC-SHA256)
function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const sig = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Optionally verify signature
  const webhookSecret = await getSetting("fathom_webhook_secret");
  if (webhookSecret) {
    const sig = req.headers.get("x-fathom-signature") ?? req.headers.get("x-webhook-signature");
    if (!verifySignature(rawBody, sig, webhookSecret)) {
      console.warn("[fathom-webhook] Signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Fathom sends either the meeting object directly or wrapped in event.data
  const meeting = body?.data ?? body?.meeting ?? body;
  // Fathom uses recording_id (number) as the unique identifier, not id
  const fathomId = meeting?.recording_id != null ? String(meeting.recording_id) : meeting?.id;
  if (!fathomId) {
    return NextResponse.json({ error: "No recording_id in payload" }, { status: 400 });
  }

  // Apply title filter
  const titleFilter = (await getSetting("fathom_title_filter")) ?? "Q&A";
  const meetingTitle = meeting.title ?? meeting.meeting_title ?? "Untitled Q&A";
  if (titleFilter && !meetingTitle.toLowerCase().includes(titleFilter.toLowerCase())) {
    return NextResponse.json({ skipped: true, reason: "Title filter did not match" });
  }

  const transcript = extractTranscript(meeting);
  const callDate = meeting.recording_start_time ?? meeting.scheduled_start_time ?? meeting.created_at ?? new Date().toISOString();
  const shareUrl = (meeting.share_url ?? meeting.url ?? "").split("#")[0];

  try {
    const qaCall = await prisma.qACall.upsert({
      where: { fathomId },
      create: {
        fathomId,
        title: meetingTitle,
        callDate: new Date(callDate),
        fathomShareUrl: shareUrl,
        fullTranscript: transcript,
        status: "pending_review",
      },
      update: {
        title: meetingTitle,
        fathomShareUrl: shareUrl,
        fullTranscript: transcript,
        status: "pending_review",
        errorMessage: null,
      },
    });

    // If transcript is available, auto-process with Claude
    if (transcript.trim()) {
      try {
        const moments = await extractMomentsWithClaude(qaCall.id, transcript, meetingTitle);
        const members = await prisma.user.findMany({
          where: { role: "foundations_member" },
          select: { id: true, fullName: true, email: true },
        });

        for (const moment of moments) {
          const memberId = moment.memberName ? fuzzyMatchMember(moment.memberName, members) : null;
          await prisma.knowledgeBaseEntry.create({
            data: {
              sourceType: "qa_call",
              sourceId: qaCall.id,
              principles: moment.principles,
              subTopic: moment.subTopic,
              summary: moment.summary,
              searchableText: moment.searchableText,
              timestampStart: moment.timestampStart,
              timestampEnd: moment.timestampEnd,
              memberId,
              isGeneralTeaching: moment.isGeneralTeaching,
              status: "pending",
            },
          });
        }

        await prisma.qACall.update({ where: { id: qaCall.id }, data: { status: "processed" } });
        console.log(`[fathom-webhook] Imported ${moments.length} moments for call ${qaCall.id}`);
      } catch (err) {
        console.error("[fathom-webhook] Claude processing error:", err);
        await prisma.qACall.update({ where: { id: qaCall.id }, data: { status: "failed", errorMessage: String(err) } });
      }
    }

    return NextResponse.json({ received: true, callId: qaCall.id });
  } catch (err) {
    console.error("[fathom-webhook] DB error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function extractTranscript(m: any): string {
  if (typeof m.transcript === "string") return m.transcript;
  if (Array.isArray(m.transcript)) {
    return m.transcript.map((seg: any) => {
      // Fathom format: { speaker: { display_name: "..." }, text: "...", timestamp: "..." }
      const speaker =
        seg.speaker?.display_name ??
        seg.speaker_name ??
        (typeof seg.speaker === "string" ? seg.speaker : "") ??
        "";
      const text = seg.text ?? seg.content ?? "";
      return speaker ? `${speaker}: ${text}` : text;
    }).filter(Boolean).join("\n");
  }
  if (typeof m.full_transcript === "string") return m.full_transcript;
  return "";
}

async function extractMomentsWithClaude(callId: string, transcript: string, callTitle: string) {
  const prompt = `You are processing a Q&A coaching call transcript from Attraction by Video. The call is titled "${callTitle}".

Extract distinct coaching moments and general teaching segments. For each moment return a JSON array:
[{
  "subTopic": string,
  "principles": string[],
  "summary": string (1-2 sentences),
  "timestampStart": number (seconds),
  "timestampEnd": number (seconds),
  "searchableText": string (transcript chunk for this moment),
  "memberName": string or null (the member being coached, null if general teaching),
  "isGeneralTeaching": boolean
}]

The 16 Attraction principles are: ${PRINCIPLES.join(", ")}.

Rules:
- Extract 5-20 moments per call
- Member-specific moments: set memberName to their first name or full name as mentioned in the call
- General teaching: set memberName to null and isGeneralTeaching to true
- Return ONLY valid JSON array, no other text

Transcript (first 15000 chars):
${transcript.substring(0, 15000)}`;

  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 6000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  return JSON.parse(jsonMatch[0]) as Array<{
    subTopic: string;
    principles: string[];
    summary: string;
    timestampStart: number;
    timestampEnd: number;
    searchableText: string;
    memberName: string | null;
    isGeneralTeaching: boolean;
  }>;
}

function fuzzyMatchMember(name: string, members: Array<{ id: string; fullName: string | null; email: string }>): string | null {
  if (!name) return null;
  const nameLower = name.toLowerCase().trim();
  for (const m of members) {
    const full = (m.fullName ?? "").toLowerCase();
    const firstName = full.split(" ")[0];
    const lastName = full.split(" ").slice(-1)[0];
    if (full === nameLower || firstName === nameLower || lastName === nameLower) return m.id;
  }
  return null;
}
