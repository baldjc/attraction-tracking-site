import prisma from "@/lib/prisma";

const CHRIS_USER = "1d08f47e-af3e-4b1c-a47c-715d69c77b62";
const CHRIS_UPLOAD = "67d3c754-cbae-4a0c-b8c1-8fc5604c8a86";

// Realtors Association of Edmonton single-letter status taxonomy, observed in
// Chris's CSV "Stat" column: A=5601, S=1729, P=755, X=440, T=994, W=3.
const EDMONTON_STATUS_CODES = [
  { label: "A", canonical: "active" },
  { label: "S", canonical: "sold" },
  { label: "P", canonical: "pending" },
  { label: "X", canonical: "expired" },
  { label: "T", canonical: "terminated" },
  { label: "W", canonical: "withdrawn" },
];

async function main() {
  const cfgBefore = await prisma.marketConfig.findFirst({
    where: { userId: CHRIS_USER },
    select: { id: true, marketName: true, mlsSource: true, statusCodes: true },
  });
  console.log("config BEFORE:", JSON.stringify(cfgBefore, null, 2));

  const uploads = await prisma.marketDataUpload.findMany({
    where: { userId: CHRIS_USER },
    select: { id: true, label: true, monthYear: true, status: true, rowCount: true },
    orderBy: { uploadedAt: "desc" },
  });
  console.log(`\nChris has ${uploads.length} upload(s):`);
  for (const u of uploads) {
    console.log(`  ${u.id} ${u.label} (${u.monthYear}) status=${u.status} rows=${u.rowCount}`);
  }

  if (!cfgBefore) throw new Error("Chris has no MarketConfig");

  await prisma.marketConfig.update({
    where: { id: cfgBefore.id },
    data: { statusCodes: EDMONTON_STATUS_CODES },
  });
  console.log("\nstatusCodes SET to Edmonton single-letter taxonomy.");

  // Force a genuine fresh AI run on the target upload: the stored
  // rawValidatorOutput was produced from the all-unknown (0 sold) aggregation,
  // so reconstructing from it would reproduce 0 leads. Clearing it + resetting
  // status makes runValidation re-aggregate (now with sold>0) and call Claude.
  const reset = await prisma.marketDataUpload.update({
    where: { id: CHRIS_UPLOAD },
    data: { status: "validating", rawValidatorOutput: null, validationError: null },
    select: { id: true, status: true },
  });
  console.log("upload reset for fresh run:", JSON.stringify(reset));

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
