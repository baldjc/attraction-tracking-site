// TEMPORARY read-only investigation (deleted after). Does NOT mutate anything.
// Finds Jared's May-2025 market-data upload and reports the state needed to plan
// a safe recovery: status, fact/aggregate/lead counts, rawValidatorOutput
// presence, and the column mapping (does it carry neighbourhood/style?).

import prisma from "@/lib/prisma";

async function main() {
  // Candidate uploads: anything that looks like May 2025 (label or monthYear),
  // plus the tell-tale ~10,678 row count. Cast a wide net, then narrow.
  const uploads = await prisma.marketDataUpload.findMany({
    where: {
      OR: [
        { label: { contains: "2025-05" } },
        { monthYear: { contains: "2025-05" } },
        { label: { contains: "May" } },
        { rowCount: 10678 },
      ],
    },
    select: {
      id: true,
      userId: true,
      label: true,
      monthYear: true,
      status: true,
      rowCount: true,
      csvFileName: true,
      csvStorageUrl: true,
      validatedAt: true,
      validationError: true,
      validationCostUsd: true,
      rawValidatorOutput: true,
      configSnapshot: true,
      uploadedAt: true,
      user: { select: { email: true, fullName: true } },
    },
    orderBy: { uploadedAt: "desc" },
  });

  console.log(`found ${uploads.length} candidate upload(s)\n`);
  for (const u of uploads) {
    const [facts, aggs, leads] = await Promise.all([
      prisma.marketFact.count({ where: { uploadId: u.id } }),
      prisma.aggregatedMetric.count({ where: { uploadId: u.id } }),
      prisma.marketStoryLead.count({ where: { uploadId: u.id } }),
    ]);
    const cfg = (u.configSnapshot ?? null) as Record<string, unknown> | null;
    const columnMapping =
      cfg && typeof cfg === "object" ? (cfg["columnMapping"] ?? null) : null;
    console.log("──────────────────────────────────────────────");
    console.log("uploadId:", u.id);
    console.log("owner:", u.user?.email, "(", u.user?.fullName, ") userId:", u.userId);
    console.log("label/monthYear:", u.label, "/", u.monthYear);
    console.log("status:", u.status, "| rowCount:", u.rowCount);
    console.log("uploadedAt:", u.uploadedAt, "| validatedAt:", u.validatedAt);
    console.log("validationError:", u.validationError);
    console.log("validationCostUsd:", u.validationCostUsd);
    console.log(
      "rawValidatorOutput:",
      u.rawValidatorOutput ? `present (${u.rawValidatorOutput.length} chars)` : "NULL",
    );
    console.log("csvFileName:", u.csvFileName);
    console.log("csvStorageUrl:", u.csvStorageUrl);
    console.log("counts -> facts:", facts, "| aggregates:", aggs, "| leads:", leads);
    console.log("columnMapping:", JSON.stringify(columnMapping, null, 2));
  }

  // Also dump the owner's MarketConfig.columnMapping (the live mapping that a
  // fresh re-validation would actually use), for the most-likely owner.
  const owner = uploads[0]?.userId;
  if (owner) {
    const mc = await prisma.marketConfig.findUnique({
      where: { userId: owner },
      select: { columnMapping: true, neighbourhoodVocab: true },
    });
    console.log("\n=== owner MarketConfig.columnMapping (live) ===");
    console.log(JSON.stringify(mc?.columnMapping ?? null, null, 2));
    console.log(
      "neighbourhoodVocab entries:",
      Array.isArray(mc?.neighbourhoodVocab) ? mc?.neighbourhoodVocab.length : 0,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
