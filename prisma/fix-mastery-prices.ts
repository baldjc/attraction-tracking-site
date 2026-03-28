import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const all = await prisma.servicePackage.findMany({ select: { id: true, name: true, price: true, priceNote: true, waitlist: true, stripeUrl: true } });
  
  for (const pkg of all) {
    if (pkg.name.includes("Mastery 2") || pkg.name.includes("Mastery - 2")) {
      await prisma.servicePackage.update({ where: { id: pkg.id }, data: { price: "$2,000/mo", priceNote: "USD" } });
      console.log(`Fixed: ${pkg.name} → $2,000/mo`);
    } else if (pkg.name.includes("Mastery 4") || pkg.name.includes("Mastery - 4")) {
      await prisma.servicePackage.update({ where: { id: pkg.id }, data: { price: "$3,000/mo", priceNote: "USD" } });
      console.log(`Fixed: ${pkg.name} → $3,000/mo`);
    }
  }

  const final = await prisma.servicePackage.findMany({ select: { name: true, price: true, priceNote: true, waitlist: true, stripeUrl: true }, orderBy: { sortOrder: "asc" } });
  console.log("\nFinal package data:");
  final.forEach(p => console.log(`  ${p.name}: ${p.price} | waitlist=${p.waitlist} | stripe=${p.stripeUrl ?? "null"}`));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
