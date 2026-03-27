import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { PRINCIPLES } from "../../lessons/route";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as any).role !== "admin") return null;
  return session.user;
}

async function getSetting(key: string): Promise<string | null> {
  const s = await prisma.appSetting.findUnique({ where: { key } });
  return s?.value ?? null;
}

async function fetchTranscriptFromFathom(fathomId: string, apiKey: string): Promise<string> {
  const res = await fetch(`https://api.fathom.ai/external/v1/meetings/${fathomId}?include_transcript=true`, {
    headers: { "X-Api-Key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`Fathom API error ${res.status} fetching transcript for ${fathomId}`);
  }
  const m = await res.json();
  if (typeof m.transcript === "string") return m.transcript;
  if (Array.isArray(m.transcript)) {
    return m.transcript.map((seg: any) => {
      const speaker = seg.speaker?.display_name ?? seg.speaker_name ?? (typeof seg.speaker === "string" ? seg.speaker : "") ?? "";
      const text = seg.text ?? seg.content ?? "";
      return speaker ? `${speaker}: ${text}` : text;
    }).filter(Boolean).join("\n");
  }
  if (typeof m.full_transcript === "string") return m.full_transcript;
  return "";
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = await getSetting("fathom_api_key");
  if (!apiKey) return NextResponse.json({ error: "Fathom API key not configured." }, { status: 400 });

  const { calls } = await req.json() as {
    calls: Array<{
      fathomId: string;
      title: string;
      callDate: string;
      fathomShareUrl: string;
      transcript?: string;
    }>;
  };

  if (!calls?.length) return NextResponse.json({ error: "No calls provided" }, { status: 400 });

  const results: Array<{ fathomId: string; status: string; momentCount?: number; error?: string }> = [];

  for (const call of calls) {
    try {
      // Fetch transcript individually from Fathom if not already provided
      let transcript = call.transcript ?? "";
      if (!transcript.trim()) {
        transcript = await fetchTranscriptFromFathom(call.fathomId, apiKey);
      }

      // Create QACall record
      const qaCall = await prisma.qACall.upsert({
        where: { fathomId: call.fathomId },
        create: {
          fathomId: call.fathomId,
          title: call.title,
          callDate: new Date(call.callDate),
          fathomShareUrl: call.fathomShareUrl,
          fullTranscript: transcript,
          status: "pending_review",
        },
        update: {
          title: call.title,
          fathomShareUrl: call.fathomShareUrl,
          fullTranscript: transcript,
          status: "pending_review",
          errorMessage: null,
        },
      });

      if (!transcript.trim()) {
        results.push({ fathomId: call.fathomId, status: "imported", momentCount: 0 });
        continue;
      }

      // Extract moments with Claude
      const moments = await extractMomentsWithClaude(qaCall.id, transcript, call.title);

      // Get all members for fuzzy matching
      const members = await prisma.user.findMany({
        where: { role: "foundations_member" },
        select: { id: true, fullName: true, email: true },
      });

      // Create KB entries
      let count = 0;
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
            memberId: memberId,
            isGeneralTeaching: moment.isGeneralTeaching,
            status: "pending",
          },
        });
        count++;
      }

      await prisma.qACall.update({ where: { id: qaCall.id }, data: { status: "processed" } });
      results.push({ fathomId: call.fathomId, status: "processed", momentCount: count });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[fathom-import] Error importing ${call.fathomId}:`, err);

      await prisma.qACall.upsert({
        where: { fathomId: call.fathomId },
        create: {
          fathomId: call.fathomId,
          title: call.title,
          callDate: new Date(call.callDate),
          fathomShareUrl: call.fathomShareUrl,
          fullTranscript: call.transcript ?? "",
          status: "failed",
          errorMessage: msg,
        },
        update: { status: "failed", errorMessage: msg },
      });

      results.push({ fathomId: call.fathomId, status: "failed", error: msg });
    }
  }

  return NextResponse.json({ results });
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
    model: "claude-sonnet-4-20250514",
    max_tokens: 6000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn(`[fathom-import] No JSON from Claude for call ${callId}`);
    return [];
  }

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
    const email = m.email.toLowerCase();
    const firstName = full.split(" ")[0];
    const lastName = full.split(" ").slice(-1)[0];

    if (full === nameLower || firstName === nameLower || lastName === nameLower || email.startsWith(nameLower)) {
      return m.id;
    }
  }
  return null;
}
