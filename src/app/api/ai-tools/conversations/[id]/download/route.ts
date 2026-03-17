import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const TOOL_NAMES: Record<string, string> = {
  avatar_architect: "Avatar Architect",
  content_engine: "Content Engine",
  title_thumbnail_analyzer: "Title & Thumbnail Analyser",
  arc_script_builder: "ARC Script Builder",
  script_review: "Script Review",
};

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildMarkdown(conv: any, memberName: string): string {
  const toolName = TOOL_NAMES[conv.toolType] ?? conv.toolType;
  const date = formatDate(new Date(conv.createdAt));
  const messages = Array.isArray(conv.messages) ? conv.messages : [];

  let md = `# ${toolName} — ${conv.title}\n`;
  md += `**Member:** ${memberName}  \n`;
  md += `**Date:** ${date}  \n`;
  md += `**Tool:** ${toolName}  \n\n`;
  md += `---\n\n`;

  for (const msg of messages) {
    const role = msg.role === "user" ? "**You**" : `**${toolName} (AI)**`;
    md += `### ${role}\n`;

    if (msg.role === "assistant" && msg.analysis) {
      const a = msg.analysis;
      if (a.one_sentence_diagnosis) {
        md += `> ${a.one_sentence_diagnosis}\n\n`;
      }
      if (a.overallScore != null) {
        md += `**Script Attraction Score:** ${Number(a.overallScore).toFixed(1)} / 10\n\n`;
      }
      if (a.scores) {
        md += `#### Scorecard\n\n`;
        md += `| Principle | Score |\n| --- | --- |\n`;
        for (const [k, v] of Object.entries(a.scores as Record<string, any>)) {
          if (k === "show_dont_tell") continue;
          const label = k.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
          const score = v?.score ?? v;
          md += `| ${label} | ${score != null ? Number(score).toFixed(1) : "N/A"} |\n`;
        }
        md += `\n`;
      }
      if (a.visual_suggestions?.length) {
        md += `#### Visual Suggestions\n\n`;
        for (const vs of a.visual_suggestions) {
          md += `- **${vs.moment}**: ${vs.suggestion} *(${vs.why})*\n`;
        }
        md += `\n`;
      }
      if (a.whats_working?.length) {
        md += `#### What's Working\n\n`;
        for (const w of a.whats_working) {
          md += `- **${w.strength}**: "${w.evidence}"\n`;
        }
        md += `\n`;
      }
    } else {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content, null, 2);
      md += `${content}\n\n`;
    }
  }

  return md;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, session] = await Promise.all([resolveUserFromSession(), auth()]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = (session?.user as any)?.role === "admin";
  const { id } = await params;
  const conversation = await prisma.aIToolConversation.findUnique({
    where: { id },
    include: { user: { select: { fullName: true, email: true } } },
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (conversation.userId !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.aIToolConversation.update({
    where: { id },
    data: { downloadCount: { increment: 1 } },
  });

  const memberName = conversation.user.fullName ?? conversation.user.email;
  const markdown = buildMarkdown(conversation, memberName);

  const toolSlug = conversation.toolType.replace(/_/g, "-");
  const titleSlug = slugify(conversation.title);
  const dateStr = formatDate(new Date(conversation.createdAt));
  const filename = `${toolSlug}_${titleSlug}_${dateStr}.md`;

  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
