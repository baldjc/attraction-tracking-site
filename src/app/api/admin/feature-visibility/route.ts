import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { FEATURE_SETTING_KEY, DEFAULT_FLAGS, FeatureFlags } from "@/lib/feature-flags";
import { logAdminAction } from "@/lib/admin-log";

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const setting = await prisma.appSetting.findUnique({
    where: { key: FEATURE_SETTING_KEY },
  });

  const flags: FeatureFlags = setting
    ? { ...DEFAULT_FLAGS, ...JSON.parse(setting.value) }
    : { ...DEFAULT_FLAGS };

  return NextResponse.json(flags);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { key, value } = body;

  if (typeof key !== "string" || typeof value !== "boolean") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.appSetting.findUnique({
    where: { key: FEATURE_SETTING_KEY },
  });

  const currentFlags: FeatureFlags = existing
    ? { ...DEFAULT_FLAGS, ...JSON.parse(existing.value) }
    : { ...DEFAULT_FLAGS };

  const updatedFlags = { ...currentFlags, [key]: value };

  await prisma.appSetting.upsert({
    where: { key: FEATURE_SETTING_KEY },
    update: { value: JSON.stringify(updatedFlags) },
    create: { key: FEATURE_SETTING_KEY, value: JSON.stringify(updatedFlags) },
  });

  await logAdminAction({
    actorId: (session.user as any).id ?? "",
    actorEmail: session.user.email ?? "",
    action: "feature_flag.changed",
    targetType: "feature_flag",
    details: { flag: key, value },
  });

  return NextResponse.json(updatedFlags);
}
