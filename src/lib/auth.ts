import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./prisma";

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

        const recent = await prisma.loginOtp.findFirst({
          where: {
            email,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!recent) return null;

        const valid = await bcrypt.compare(code, recent.codeHash);
        if (!valid) return null;

        await prisma.loginOtp.update({
          where: { id: recent.id },
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
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
