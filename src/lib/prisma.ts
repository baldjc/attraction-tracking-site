import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient>;
};

function cleanUrl(url: string | undefined): string | undefined {
  return url?.replace(/\s+/g, "") || undefined;
}

const NEON_URL =
  "postgresql://neondb_owner:npg_A0Xneoz5xFhd@ep-odd-dream-amrl8l3f-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

function createPrismaClient() {
  const connectionString =
    cleanUrl(process.env.NEON_DATABASE_URL) ??
    cleanUrl(process.env.DATABASE_URL) ??
    NEON_URL;
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
