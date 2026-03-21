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

function buildTitleThumbnailMarkdown(conv: any, memberName: string): string {
  const date = formatDate(new Date(conv.createdAt));
  const r = (conv.metadata as any)?.analysisResult;
  const videoTitle = (conv.metadata as any)?.videoTitle ?? conv.title;

  let md = `# Title & Thumbnail Analysis — ${videoTitle}\n`;
  md += `**Member:** ${memberName}  \n`;
  md += `**Date:** ${date}  \n\n`;
  md += `---\n\n`;

  if (!r) {
    md += `*Full analysis data not available for this session.*\n`;
    return md;
  }

  md += `## Scores\n\n`;
  md += `| Category | Score |\n| --- | --- |\n`;
  if (r.thumbnail?.score != null) md += `| Thumbnail | ${r.thumbnail.score}/20 |\n`;
  if (r.title?.score != null) md += `| Title | ${r.title.score}/20 |\n`;
  if (r.combined?.score != null) md += `| Combined | ${r.combined.score}/20 |\n`;
  if (r.intro?.score != null) md += `| Intro | ${r.intro.score}/20 |\n`;
  md += `\n`;

  if (r.title?.attraction_scores) {
    const as_ = r.title.attraction_scores;
    md += `## Attraction Principle Scores\n\n`;
    md += `| Principle | Score |\n| --- | --- |\n`;
    if (as_.title_frameworks != null) md += `| Title Frameworks | ${as_.title_frameworks}/10 |\n`;
    if (as_.approve_the_click != null) md += `| Approve the Click | ${as_.approve_the_click}/10 |\n`;
    if (as_.avatar_clarity != null) md += `| Avatar Clarity | ${as_.avatar_clarity}/10 |\n`;
    md += `\n`;
    if (r.title.framework_used) md += `**Framework detected:** ${r.title.framework_used}\n\n`;
  }

  if (r.title?.alternatives?.length) {
    md += `## Improved Title Alternatives\n\n`;
    for (let i = 0; i < r.title.alternatives.length; i++) {
      md += `${i + 1}. ${r.title.alternatives[i]}\n`;
    }
    md += `\n`;
  }

  if (r.title?.observations?.length) {
    md += `## Title Observations\n\n`;
    for (const o of r.title.observations) md += `- ${o}\n`;
    md += `\n`;
  }

  if (r.thumbnail?.observations?.length) {
    md += `## Thumbnail Observations\n\n`;
    for (const o of r.thumbnail.observations) md += `- ${o}\n`;
    md += `\n`;
  }

  if (r.thumbnail?.improvements?.length) {
    md += `## Thumbnail Improvements\n\n`;
    for (const o of r.thumbnail.improvements) md += `- ${o}\n`;
    md += `\n`;
  }

  if (r.combined?.observations?.length) {
    md += `## Combined Observations\n\n`;
    for (const o of r.combined.observations) md += `- ${o}\n`;
    md += `\n`;
  }

  if (r.combined?.improvements?.length) {
    md += `## Combined Improvements\n\n`;
    for (const o of r.combined.improvements) md += `- ${o}\n`;
    md += `\n`;
  }

  if (r.combined?.thumbnail_concepts?.length) {
    md += `## Thumbnail Concepts\n\n`;
    for (const o of r.combined.thumbnail_concepts) md += `- ${o}\n`;
    md += `\n`;
  }

  if (r.combined?.redundancies?.length) {
    md += `## Redundancies to Fix\n\n`;
    for (const o of r.combined.redundancies) md += `- ${o}\n`;
    md += `\n`;
  }

  if (r.intro?.observations?.length) {
    md += `## Intro Observations\n\n`;
    for (const o of r.intro.observations) md += `- ${o}\n`;
    md += `\n`;
  }

  if (r.intro?.improvements?.length) {
    md += `## Intro Improvements\n\n`;
    for (const o of r.intro.improvements) md += `- ${o}\n`;
    md += `\n`;
  }

  if (r.follow_up) {
    md += `## Next Steps\n\n${r.follow_up}\n\n`;
  }

  return md;
}

function buildMarkdown(conv: any, memberName: string): string {
  if (conv.toolType === "title_thumbnail_analyzer") {
    return buildTitleThumbnailMarkdown(conv, memberName);
  }

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
