import { createHash, randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import { resolveUserFromSession, type ResolvedUser } from "@/lib/session-utils";

/** How long a team invite stays valid before it must be re-sent. */
export const INVITE_TTL_DAYS = 7;

export type TeamActorType = "primary" | "team" | "admin";

/**
 * Generate a high-entropy invite token. The raw token is emailed to the
 * invitee; only its SHA-256 hash is persisted, so a leaked database row cannot
 * be used to accept an invite.
 */
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Resolve a public base URL for links emailed to recipients. Mirrors the
 * precedence used in `@/lib/email` so invite links never point at localhost
 * from a dev environment.
 */
export function getAppBaseUrl(): string {
  const raw =
    process.env.EMAIL_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.NEXTAUTH_URL &&
    !/localhost|127\.0\.0\.1|0\.0\.0\.0|\.repl(\.co|it\.dev)/i.test(process.env.NEXTAUTH_URL)
      ? process.env.NEXTAUTH_URL
      : null) ??
    "https://members.attractionbyvideo.com";
  return raw.replace(/\/$/, "");
}

/**
 * Append a row to the team-access audit trail. Failures are swallowed (logged)
 * so an audit-write hiccup never blocks the underlying action.
 */
export async function logTeamActivity(params: {
  primaryUserId: string;
  actorType: TeamActorType;
  actorUserId?: string | null;
  actorName?: string | null;
  action: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.teamActivityLog.create({
      data: {
        primaryUserId: params.primaryUserId,
        actorType: params.actorType,
        actorUserId: params.actorUserId ?? null,
        actorName: params.actorName ?? null,
        action: params.action,
        metadata: (params.metadata ?? undefined) as never,
      },
    });
  } catch (err) {
    console.error("[team] failed to write activity log", params.action, err);
  }
}

/**
 * Guard for actions that must originate from the primary account holder
 * operating on their OWN account — not a team member acting on their behalf and
 * not an admin impersonating them. Returns the resolved user when allowed, or
 * null otherwise (callers should respond 401/403).
 */
export async function requirePrimaryUser(): Promise<ResolvedUser | null> {
  const user = await resolveUserFromSession();
  if (!user) return null;
  if (user.actingAsTeamMember) return null;
  if (user.isImpersonating) return null;
  return user;
}
