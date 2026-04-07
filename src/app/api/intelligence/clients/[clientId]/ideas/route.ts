import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function adminOnly() {
  const session = await auth();
  return (session?.user as any)?.role === "admin" ? session : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;

  const ideas = await prisma.contentIdea.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(ideas);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;

  const body = await req.json();

  if (body.manual) {
    const idea = await prisma.contentIdea.create({
      data: {
        clientId,
        title: body.title,
        outline: body.outline ?? null,
        audience: body.audience ?? null,
        theme: body.theme ?? null,
        angle: body.angle ?? null,
      },
    });
    return NextResponse.json(idea, { status: 201 });
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      seoClusters: { include: { keywords: { take: 10 } }, take: 5 },
    },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const clusterContext = client.seoClusters
    .map((c) => `Cluster "${c.name}": ${c.keywords.map((k) => k.keyword).join(", ")}`)
    .join("\n");

  const prompt = `You are a YouTube content strategist for a real estate agent.

Client: ${client.name}
Market: ${client.city}${client.province ? `, ${client.province}` : ""}
Primary Audience: ${client.audiencePrimary}

Keyword Clusters:
${clusterContext || "No clusters defined yet."}

Generate 5 YouTube video ideas for this client. For each idea provide:
1. A compelling title (using proven YouTube frameworks)
2. A brief 2-sentence outline
3. Why this idea will perform well for their audience

Respond in valid JSON only:
[
  { "title": "...", "outline": "...", "theme": "Decision Paralysis|Equity Anxiety|Market Uncertainty|Timeline Pressure|Financial Fear|Neighbourhood Fit|First-Time Overwhelm" }
]`;

  try {
    const res = await ai.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content[0].type === "text" ? res.content[0].text : "[]";
    const ideas = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim()) as Array<{
      title: string; outline: string; theme: string;
    }>;

    const created = await Promise.all(
      ideas.map((idea) =>
        prisma.contentIdea.create({
          data: { clientId, title: idea.title, outline: idea.outline, status: "idea" },
        })
      )
    );
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, status } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "id and status required" }, { status: 400 });
  const idea = await prisma.contentIdea.update({ where: { id }, data: { status } });
  return NextResponse.json(idea);
}
