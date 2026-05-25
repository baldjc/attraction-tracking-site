import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./prisma";

// Inlined to avoid circular import with `@/lib/auth-utils` (which itself
// depends on `auth`). Keep in sync with `getMainOwnerEmail` there.
function isMainOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const owner = (process.env.ADMIN_EMAIL ?? "jared@attractionbyvideo.com").trim().toLowerCase();
  return email.trim().toLowerCase() === owner;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.SESSION_SECRET ?? process.env.AUTH_SECRET,
  trustHost: true,
  providers: [
    Credentials({
      name: "otp",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.code) return null;

        const email = (credentials.email as string).trim().toLowerCase();
        const code = (credentials.code as string).trim();

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        // Check every unused, unexpired OTP for this email — NOT just the
        // most recent. Users routinely have multiple valid codes in flight
        // because the resend button, double-clicks, multi-tab requests, and
        // network retries all insert new rows. Previously we only compared
        // against the newest row, which silently invalidated every earlier
        // code the moment a second one was issued — even if those codes
        // had not expired and were the ones the user actually opened in
        // their email. Iterating over all valid candidates preserves
        // single-use semantics (we mark the matched row used) and the
        // 10-min expiry without that footgun.
        const candidates = await prisma.loginOtp.findMany({
          where: {
            email,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
          // Cap to bound bcrypt work in pathological cases. A user can't
          // realistically open more than a handful of distinct codes at
          // once; older valid rows fall off the list rather than being
          // rejected outright.
          take: 10,
        });

        if (candidates.length === 0) return null;

        let matched: { id: string } | null = null;
        for (const c of candidates) {
          // eslint-disable-next-line no-await-in-loop -- sequential by design
          if (await bcrypt.compare(code, c.codeHash)) {
            matched = c;
            break;
          }
        }
        if (!matched) return null;

        await prisma.loginOtp.update({
          where: { id: matched.id },
          data: { usedAt: new Date() },
        });

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.id = user.id;
        const u = user as { email?: string | null };
        if (u.email) token.email = u.email;
      }
      if (!token.email && token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { email: true, role: true },
          });
          if (dbUser?.email) token.email = dbUser.email;
          if (dbUser?.role && !token.role) token.role = dbUser.role;
        } catch {}
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
        const su = session.user as { email?: string | null; isMainOwner?: boolean };
        su.isMainOwner = isMainOwnerEmail(
          (token.email as string | undefined) ?? su.email ?? null,
        );
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 365 * 24 * 60 * 60, // 1 year
  },
});
