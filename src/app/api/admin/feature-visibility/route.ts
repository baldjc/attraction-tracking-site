import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { FEATURE_SETTING_KEY, DEFAULT_FLAGS, FeatureFlags } from "@/lib/feature-flags";
import { logAdminAction } from "@/lib/admin-log";

// Wave 0 — flag values can be plain boolean (existing 27 flags) OR an object
// `{ enabled, allowedUserIds }` for v2 per-user gated flags (the new 7). The
// PUT handler below enforces the contract: a key's shape never changes once
// it exists. Booleans stay boolean, objects stay object.
type StoredFlagValue =
  | boolean
  | { enabled: boolean; allowedUserIds: string[] };

function isStoredFlagObject(
  v: unknown
): v is { enabled: boolean; allowedUserIds: string[] } {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.enabled === "boolean" &&
    Array.isArray(o.allowedUserIds) &&
    o.allowedUserIds.every((id) => typeof id === "string")
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const setting = await prisma.appSetting.findUnique({
    where: { key: FEATURE_SETTING_KEY },
  });

  // Return the raw stored shape (booleans + objects) for the admin editor.
  // Member-facing routes use `getFeatureFlags()` from src/lib/feature-flags.ts
  // which resolves objects to booleans via the allowlist.
  const stored: Record<string, StoredFlagValue> = setting
    ? JSON.parse(setting.value)
    : {};

  const merged: Record<string, StoredFlagValue> = {
    ...(DEFAULT_FLAGS as unknown as Record<string, StoredFlagValue>),
    ...stored,
  };

  return NextResponse.json(merged as unknown as FeatureFlags);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { key, value } = body as { key?: unknown; value?: unknown };

  if (typeof key !== "string") {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const incomingIsBool = typeof value === "boolean";
  const incomingIsObj = isStoredFlagObject(value);
  if (!incomingIsBool && !incomingIsObj) {
    return NextResponse.json(
      {
        error:
          "Invalid value — must be boolean or { enabled: boolean, allowedUserIds: string[] }",
      },
      { status: 400 }
    );
  }

  const existing = await prisma.appSetting.findUnique({
    where: { key: FEATURE_SETTING_KEY },
  });

  const currentFlags: Record<string, StoredFlagValue> = existing
    ? { ...(DEFAULT_FLAGS as unknown as Record<string, StoredFlagValue>), ...JSON.parse(existing.value) }
    : { ...(DEFAULT_FLAGS as unknown as Record<string, StoredFlagValue>) };

  // Shape-preservation contract: if the key already has a stored value, the
  // incoming value must use the same shape (boolean ↔ boolean, object ↔
  // object). This is the safety net behind the doctrine that existing
  // boolean flags must stay boolean forever.
  if (key in currentFlags) {
    const existingVal = currentFlags[key];
    const existingIsBool = typeof existingVal === "boolean";
    const existingIsObj = isStoredFlagObject(existingVal);
    if (existingIsBool && !incomingIsBool) {
      return NextResponse.json(
        { error: `Flag "${key}" is boolean; cannot coerce to object` },
        { status: 400 }
      );
    }
    if (existingIsObj && !incomingIsObj) {
      return NextResponse.json(
        { error: `Flag "${key}" is object-shape; cannot coerce to boolean` },
        { status: 400 }
      );
    }
  }

  // If the value is an object, validate that every allowedUserId actually
  // refers to a real user. This keeps the JSON clean and prevents typos from
  // silently sitting in the DB.
  if (incomingIsObj) {
    const ids = (value as { allowedUserIds: string[] }).allowedUserIds;
    if (ids.length > 0) {
      const found = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      if (found.length !== ids.length) {
        const foundSet = new Set(found.map((u) => u.id));
        const missing = ids.filter((id) => !foundSet.has(id));
        return NextResponse.json(
          { error: `Unknown user IDs in allowlist: ${missing.join(", ")}` },
          { status: 400 }
        );
      }
    }
  }

  const updatedFlags = { ...currentFlags, [key]: value as StoredFlagValue };

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
    details: { flag: key, value: value as StoredFlagValue },
  });

  return NextResponse.json(updatedFlags);
}
