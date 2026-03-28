import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const PRICE_MAP: Record<string, { price: string; priceNote: string }> = {
  "2 Video Package":  { price: "$500/mo",    priceNote: "USD" },
  "2 Video + Jared":  { price: "$800/mo",    priceNote: "USD" },
  "4 Video Package":  { price: "$1,000/mo",  priceNote: "USD" },
  "4 Video + Jared":  { price: "$1,500/mo",  priceNote: "USD" },
  "Mastery 2":        { price: "$2,000/mo",  priceNote: "USD" },
  "Mastery 4":        { price: "$3,000/mo",  priceNote: "USD" },
  "Ultimate Mastery": { price: "$4,500/mo",  priceNote: "USD" },
};

async function main() {
  const all = await prisma.servicePackage.findMany();
  for (const pkg of all) {
    const priceUpdate = PRICE_MAP[pkg.name];
    await prisma.servicePackage.update({
      where: { id: pkg.id },
      data: {
        waitlist: true,
        stripeUrl: null,
        ...(priceUpdate ?? {}),
      },
    });
    console.log(`Updated: ${pkg.name}`);
  }
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
