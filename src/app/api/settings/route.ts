import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DEFAULT_SCORING_PROMPT } from "@/lib/audit-engine";

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setting = await prisma.appSetting.findUnique({
    where: { key: "audit_prompt" },
  });

  return NextResponse.json({
    audit_prompt: setting?.value ?? DEFAULT_SCORING_PROMPT,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { audit_prompt } = await req.json();

  await prisma.appSetting.upsert({
    where: { key: "audit_prompt" },
    update: { value: audit_prompt },
    create: { key: "audit_prompt", value: audit_prompt },
  });

  return NextResponse.json({ success: true });
}
