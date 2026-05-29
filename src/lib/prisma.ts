import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient>;
  pgPool: Pool;
};

function cleanUrl(url: string | undefined): string | undefined {
  return url?.replace(/\s+/g, "") || undefined;
}

function createPool(): Pool {
  const connectionString =
    cleanUrl(process.env.NEON_DATABASE_URL) ?? cleanUrl(process.env.DATABASE_URL);
  if (!connectionString) {
    throw new Error(
      "Database connection string is not configured. Set NEON_DATABASE_URL or DATABASE_URL.",
    );
  }
  const pool = new Pool({
    connectionString,
    // Recycle idle connections well before Neon's pooler drops them, which is
    // what surfaces as "Connection terminated unexpectedly" on the next query.
    idleTimeoutMillis: 30_000,
    // Periodically retire connections so a long-lived but server-side-closed
    // socket never gets handed to a query.
    maxUses: 7_500,
    keepAlive: true,
    connectionTimeoutMillis: 10_000,
    max: 10,
  });
  // Without a listener, an error on an idle client is emitted on the Pool and
  // can crash the process. Log and let pg evict the bad client.
  pool.on("error", (err) => {
    console.error("[prisma] idle pg pool client error:", err.message);
  });
  return pool;
}

function createPrismaClient() {
  const pool = globalForPrisma.pgPool || createPool();
  if (process.env.NODE_ENV !== "production") globalForPrisma.pgPool = pool;
  const adapter = new PrismaPg(pool, { onPoolError: (err) => {
    console.error("[prisma] pool error:", err.message);
  } });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
