// STEP 1 DIAGNOSE (read-only) — map a member's neighbourhoods across BOTH stores.
//   npx tsx scripts/debug-kb-neighbourhoods.ts "chris"
// Prints KB profiles (NeighbourhoodProfile) and market-data neighbourhoods
// (distinct from MarketFact + AggregatedMetric, per upload), flags likely
// garbage, and reports canonical/alias state. Changes NOTHING.

import prisma from "@/lib/prisma";

function looksGarbage(name: string): string | null {
  const raw = name ?? "";
  const t = raw.trim();
  if (t.length === 0) return "blank/whitespace";
  if (t !== raw) return "leading/trailing whitespace";
  if (/^[\d\s.,$%-]+$/.test(t)) return "numeric/symbol-only";
  if (t.length <= 2) return "too short";
  if (/^(neighbourhood|neighborhood|area|community|district|subdivision|name|n\/a|na|null|none|unknown|total|all)$/i.test(t))
    return "header/placeholder";
  if (/^[^a-zA-Z]*$/.test(t)) return "no letters";
  if (/[<>{}|\\^~`]/.test(t)) return "odd symbols";
  return null;
}

async function main() {
  const term = (process.argv[2] || "chris").toLowerCase();

  const con = await prisma.$queryRawUnsafe<{ db: string }[]>(
    "SELECT current_database() as db",
  );
  console.log(`\n=== DB: ${con[0]?.db} | search term: "${term}" ===\n`);

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { fullName: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
      ],
    },
    select: { id: true, fullName: true, email: true },
  });
  if (users.length === 0) {
    console.log("No matching user. Try a different term.");
    return;
  }
  console.log("Matched users:");
  for (const u of users) console.log(`  ${u.id}  ${u.fullName ?? "—"}  <${u.email}>`);

  // Prefer an exact-ish "chris proctor" match if present, else first.
  const user =
    users.find((u) => /chris/i.test(u.fullName ?? "") && /proctor/i.test(u.fullName ?? "")) ??
    users[0];
  console.log(`\n>>> Using: ${user.fullName ?? "—"} <${user.email}> (${user.id})\n`);
  const userId = user.id;

  // ---- STORE A: KB profiles -------------------------------------------------
  const profiles = await prisma.neighbourhoodProfile.findMany({
    where: { userId },
    select: { neighbourhood: true, summary: true, content: true, sourceFile: true },
    orderBy: { neighbourhood: "asc" },
  });
  console.log(`========== STORE A — NeighbourhoodProfile (KB) ==========`);
  console.log(`count: ${profiles.length}`);
  const profGarbage = profiles
    .map((p) => ({ name: p.neighbourhood, reason: looksGarbage(p.neighbourhood) }))
    .filter((x) => x.reason);
  console.log(`likely-garbage: ${profGarbage.length}`);
  profGarbage.slice(0, 40).forEach((g) => console.log(`   ⚠ "${g.name}" — ${g.reason}`));
  console.log(`sample names (first 40):`);
  profiles.slice(0, 40).forEach((p) =>
    console.log(`   • "${p.neighbourhood}"  [summary:${p.summary ? "y" : "n"} content:${p.content?.length ?? 0}c file:${p.sourceFile ?? "—"}]`),
  );

  // ---- STORE B: market-data neighbourhoods ----------------------------------
  const uploads = await prisma.marketDataUpload.findMany({
    where: { userId },
    select: { id: true, label: true, monthYear: true, status: true, rowCount: true, validatedAt: true },
    orderBy: { uploadedAt: "desc" },
  });
  console.log(`\n========== STORE B — Market data uploads ==========`);
  console.log(`uploads: ${uploads.length}`);
  uploads.forEach((u) =>
    console.log(`   ${u.id}  ${u.monthYear}  ${u.status}  rows:${u.rowCount}  ${u.label}`),
  );

  // Distinct neighbourhoods across ALL facts/metrics for this member.
  const factHoods = await prisma.marketFact.findMany({
    where: { userId },
    select: { neighbourhood: true },
    distinct: ["neighbourhood"],
  });
  const metricHoods = await prisma.aggregatedMetric.findMany({
    where: { userId },
    select: { neighbourhood: true },
    distinct: ["neighbourhood"],
  });
  const factSet = factHoods.map((f) => f.neighbourhood).sort();
  const metricSet = metricHoods.map((m) => m.neighbourhood).sort();
  console.log(`\n-- distinct MarketFact.neighbourhood: ${factSet.length}`);
  const factGarbage = factSet.map((n) => ({ n, r: looksGarbage(n) })).filter((x) => x.r);
  console.log(`   likely-garbage: ${factGarbage.length}`);
  factGarbage.slice(0, 50).forEach((g) => console.log(`      ⚠ "${g.n}" — ${g.r}`));
  console.log(`   sample (first 50): ${factSet.slice(0, 50).map((n) => `"${n}"`).join(", ")}`);

  console.log(`\n-- distinct AggregatedMetric.neighbourhood: ${metricSet.length}`);
  const metricGarbage = metricSet.map((n) => ({ n, r: looksGarbage(n) })).filter((x) => x.r);
  console.log(`   likely-garbage (basic heuristic): ${metricGarbage.length}`);
  metricGarbage.slice(0, 50).forEach((g) => console.log(`      ⚠ "${g.n}" — ${g.r}`));
  // Full dump so fragment/subdivision garbage is visible to a human.
  console.log(`\n   FULL AggregatedMetric distinct list (${metricSet.length}):`);
  metricSet.forEach((n, i) => console.log(`      ${String(i + 1).padStart(3)}. "${n}"`));

  // Case-insensitive duplicate detection on the union.
  const union = Array.from(new Set([...factSet, ...metricSet]));
  const byLower = new Map<string, string[]>();
  for (const n of union) {
    const k = n.trim().toLowerCase();
    byLower.set(k, [...(byLower.get(k) ?? []), n]);
  }
  const dupes = Array.from(byLower.values()).filter((v) => v.length > 1);
  console.log(`\n-- case/space duplicate clusters: ${dupes.length}`);
  dupes.slice(0, 25).forEach((v) => console.log(`      ${v.map((x) => `"${x}"`).join(" == ")}`));

  // ---- Canonical / alias state ----------------------------------------------
  const canonCount = await prisma.canonicalArea.count({ where: { userId } });
  const aliasCount = await prisma.areaAlias.count({ where: { userId } });
  const mergeRuns = await prisma.mergeRun.findMany({
    where: { userId },
    select: { id: true, status: true, rawCount: true, canonicalCount: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log(`\n========== Canonical/merge state ==========`);
  console.log(`CanonicalArea: ${canonCount}  AreaAlias: ${aliasCount}`);
  mergeRuns.forEach((m) =>
    console.log(`   mergeRun ${m.id} ${m.status} raw:${m.rawCount}→canon:${m.canonicalCount} ${m.createdAt.toISOString()}`),
  );

  // ---- Downstream touch counts (what delete/reset would affect) -------------
  const profileTotal = await prisma.neighbourhoodProfile.count({ where: { userId } });
  const factTotal = await prisma.marketFact.count({ where: { userId } });
  const metricTotal = await prisma.aggregatedMetric.count({ where: { userId } });
  const leadTotal = await prisma.marketStoryLead.count({ where: { userId } });
  console.log(`\n========== Row totals (member-scoped) ==========`);
  console.log(`NeighbourhoodProfile rows: ${profileTotal}`);
  console.log(`MarketFact rows: ${factTotal}`);
  console.log(`AggregatedMetric rows: ${metricTotal}`);
  console.log(`MarketStoryLead rows: ${leadTotal}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
