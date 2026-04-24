import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { IMPERSONATE_COOKIE, parseImpersonateCookie } from "@/lib/impersonate-constants";

/**
 * Staff (admin or editor) member-scope access helpers.
 *
 * - admin   → unrestricted access to every member.
 * - editor  → restricted by `User.allowedMemberIds`:
 *               • null/undefined  → full access (legacy / unset)
 *               • string[]        → may only access listed member ids
 */

type StaffRow = {
  role: string | null;
  allowedMemberIds: unknown;
};

async function loadStaff(staffUserId: string): Promise<StaffRow | null> {
  return prisma.user.findUnique({
    where: { id: staffUserId },
    select: { role: true, allowedMemberIds: true },
  });
}

function parseAllowed(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return null; // null/missing = full access
  if (Array.isArray(raw)) return raw as string[]; // array (incl. []) = scoped
  return []; // malformed value → deny-all (fail closed)
}

/**
 * Returns the "effective" staff user id given the actor's id. When the actor
 * is impersonating a Staff Admin (editor) via the impersonation cookie, that
 * impersonated user's id is returned so the actor sees exactly what the Staff
 * Admin would see (same allowedMemberIds restrictions). Otherwise the actor's
 * own id is returned.
 */
export async function getEffectiveStaffUserId(actorId: string): Promise<string> {
  try {
    const cookieStore = await cookies();
    const impersonateId = parseImpersonateCookie(
      cookieStore.get(IMPERSONATE_COOKIE)?.value,
      actorId,
    );
    if (!impersonateId || impersonateId === actorId) return actorId;
    const target = await prisma.user.findUnique({
      where: { id: impersonateId },
      select: { id: true, role: true },
    });
    if (target?.role === "editor") return target.id;
    return actorId;
  } catch {
    return actorId;
  }
}

/** True if the actor is currently impersonating a Staff Admin (editor). */
export async function isImpersonatingStaff(): Promise<boolean> {
  try {
    const session = await auth();
    const actorId = (session?.user as { id?: string } | undefined)?.id;
    if (!actorId) return false;
    const cookieStore = await cookies();
    const impersonateId = parseImpersonateCookie(
      cookieStore.get(IMPERSONATE_COOKIE)?.value,
      actorId,
    );
    if (!impersonateId) return false;
    const target = await prisma.user.findUnique({
      where: { id: impersonateId },
      select: { role: true },
    });
    return target?.role === "editor";
  } catch {
    return false;
  }
}

/** True if the given staff user is allowed to access the given member id.
 *  Honors impersonation: if the actor is "viewing as" a Staff Admin, the
 *  impersonated user's restrictions are enforced instead of the actor's. */
export async function canStaffAccessMember(
  staffUserId: string,
  memberId: string
): Promise<boolean> {
  const effectiveId = await getEffectiveStaffUserId(staffUserId);
  const staff = await loadStaff(effectiveId);
  if (!staff) return false;
  if (staff.role === "admin") return true;
  if (staff.role !== "editor") return false;
  const allowed = parseAllowed(staff.allowedMemberIds);
  if (allowed === null) return true; // editor with no restrictions
  return allowed.includes(memberId);
}

/**
 * Prisma where-fragment for filtering a `userId` (or member-id) field by the
 * staff member's allowed scope. Returns `undefined` when no scoping is needed
 * (admin, or editor with full access).
 */
export async function staffMemberIdFilter(
  staffUserId: string
): Promise<{ in: string[] } | undefined> {
  const effectiveId = await getEffectiveStaffUserId(staffUserId);
  const staff = await loadStaff(effectiveId);
  if (!staff || staff.role === "admin") return undefined;
  if (staff.role !== "editor") return { in: [] };
  const allowed = parseAllowed(staff.allowedMemberIds);
  if (allowed === null) return undefined;
  return { in: allowed };
}

/**
 * Combined auth + member-scope guard for admin/editor API routes that operate
 * on a single member id. Returns the resolved session on success, or a ready-to-
 * return NextResponse on failure. Use:
 *
 *   const access = await requireStaffMemberAccess(id);
 *   if (!access.ok) return access.response;
 *   const session = access.session;
 */
export async function requireStaffMemberAccess(memberId: string): Promise<
  | { ok: true; session: Awaited<ReturnType<typeof auth>> }
  | { ok: false; response: NextResponse }
> {
  const session = await auth();
  const sessionUser = session?.user as { id?: string; role?: string } | undefined;
  const role = sessionUser?.role;
  const userId = sessionUser?.id;
  if (!session?.user || (role !== "admin" && role !== "editor") || !userId) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await canStaffAccessMember(userId, memberId))) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, session };
}
