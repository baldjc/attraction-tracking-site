import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient>;
};

function cleanUrl(url: string | undefined): string | undefined {
  return url?.replace(/\s+/g, "");
}

function createPrismaClient() {
  const connectionString =
    cleanUrl(process.env.NEON_DATABASE_URL) ??
    cleanUrl(process.env.DATABASE_URL);
  if (!connectionString) {
    throw new Error("No database connection string found. Set NEON_DATABASE_URL.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
