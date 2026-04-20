import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { invalidateReviewerFlagCache } from "@/lib/reviewer-flag";

export async function PATCH(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdmin(role ?? "")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: { enabled?: boolean };
  try {
    body = (await req.json()) as { enabled?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled must be boolean" },
      { status: 400 },
    );
  }

  const value = body.enabled ? "true" : "false";
  await prisma.appSetting.upsert({
    where: { key: "tool_analytics_reviewer" },
    create: { key: "tool_analytics_reviewer", value },
    update: { value },
  });
  invalidateReviewerFlagCache();

  return NextResponse.json({ success: true, enabled: body.enabled });
}
