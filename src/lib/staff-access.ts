import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { IMPERSONATE_COOKIE, parseImpersonateCookie } from "@/lib/impersonate-constants";
import { isMainOwnerEmail } from "@/lib/auth-utils";

/**
 * Staff (admin or editor) member-scope access helpers.
 *
 * - main owner (Jared)   → unrestricted access to every member.
 * - any other admin/editor → restricted by `User.allowedMemberIds`:
 *               • null/undefined  → full access (legacy / unset)
 *               • string[]        → may only access listed member ids
 */

type StaffRow = {
  role: string | null;
  email: string | null;
  allowedMemberIds: unknown;
};

async function loadStaff(staffUserId: string): Promise<StaffRow | null> {
  return prisma.user.findUnique({
    where: { id: staffUserId },
    select: { role: true, email: true, allowedMemberIds: true },
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
    // Intentionally NOT impersonation-aware: needs the actual actor id to
    // evaluate whether THEY are impersonating an editor.
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
 *  The main owner (Jared) always has access — even if they're currently
 *  "viewing as" a Staff Admin for UI purposes — so the owner never gets
 *  locked out of member data because of a stale impersonation cookie. */
export async function canStaffAccessMember(
  staffUserId: string,
  memberId: string
): Promise<boolean> {
  // Real session user — bypass scoping entirely if they are the main owner.
  const actor = await loadStaff(staffUserId);
  if (isMainOwnerEmail(actor?.email)) return true;

  const effectiveId = await getEffectiveStaffUserId(staffUserId);
  const staff = effectiveId === staffUserId ? actor : await loadStaff(effectiveId);
  if (!staff) return false;
  if (isMainOwnerEmail(staff.email)) return true;
  if (staff.role !== "admin" && staff.role !== "editor") return false;
  const allowed = parseAllowed(staff.allowedMemberIds);
  if (allowed === null) return true; // sub-admin with no restrictions
  return allowed.includes(memberId);
}

/**
 * Prisma where-fragment for filtering a `userId` (or member-id) field by the
 * staff member's allowed scope. Returns `undefined` when no scoping is needed
 * (main owner, or sub-admin/editor with full access).
 */
export async function staffMemberIdFilter(
  staffUserId: string
): Promise<{ in: string[] } | undefined> {
  // Real session user — the main owner always sees everything regardless of
  // any active impersonation cookie.
  const actor = await loadStaff(staffUserId);
  if (isMainOwnerEmail(actor?.email)) return undefined;

  const effectiveId = await getEffectiveStaffUserId(staffUserId);
  const staff = effectiveId === staffUserId ? actor : await loadStaff(effectiveId);
  if (!staff) return { in: [] };
  if (isMainOwnerEmail(staff.email)) return undefined;
  if (staff.role !== "admin" && staff.role !== "editor") return { in: [] };
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
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse }
> {
  // Intentionally NOT impersonation-aware: this gate authorizes the actual
  // staff actor (admin/editor) against a target member. Must use the real
  // session id/role, never the impersonated member.
  const session = (await auth()) as Session | null;
  const role = session?.user?.role;
  const userId = session?.user?.id;
  if (!session?.user || (role !== "admin" && role !== "editor") || !userId) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await canStaffAccessMember(userId, memberId))) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, session };
}
