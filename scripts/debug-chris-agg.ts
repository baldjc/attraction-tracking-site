import prisma from "@/lib/prisma";
import { readUploadFile } from "@/lib/market-csv";
import { parseCsvRecords, detectDelimiter } from "@/lib/csv-parse-options";
import { aggregateUploadFromDb } from "@/lib/csv-aggregate";

const UPLOAD = "9acbee50-cafd-4229-a9d0-006eb611d93c";

async function main() {
  const up = await prisma.marketDataUpload.findUnique({
    where: { id: UPLOAD },
    select: { id: true, userId: true, monthYear: true, csvStorageUrl: true, csvFileName: true },
  });
  if (!up?.csvStorageUrl) { console.log("no csv"); return; }
  const buf = await readUploadFile(up.csvStorageUrl);
  const text = buf.toString("utf8");
  const rows = parseCsvRecords<string[]>(text, { delimiter: detectDelimiter(text) });
  const header = rows[0];
  console.log("HEADERS:", header.map((h) => `"${h}"`).join(", "));
  const body = rows.slice(1);

  function distinct(name: RegExp) {
    const idx = header.findIndex((h) => name.test(h));
    if (idx < 0) return { idx, label: null as string | null, vals: [] as [string, number][] };
    const m = new Map<string, number>();
    for (const r of body) {
      const v = (r[idx] ?? "").trim();
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return { idx, label: header[idx], vals: [...m.entries()].sort((a, b) => b[1] - a[1]) };
  }

  for (const [lab, re] of [
    ["Style", /^style$/i],
    ["PropertyType", /^property\s*type$/i],
    ["PropertyClass", /^property\s*class$/i],
    ["Status", /^status$/i],
  ] as [string, RegExp][]) {
    const d = distinct(re);
    console.log(`\n## ${lab} (idx=${d.idx}, header=${d.label}) — ${d.vals.length} distinct`);
    console.log(d.vals.slice(0, 25).map(([v, n]) => `  "${v}": ${n}`).join("\n"));
  }

  console.log("\n\n===== RE-AGGREGATE =====");
  const { table } = await aggregateUploadFromDb(UPLOAD);
  // table.groups: each has neighbourhood, propertyType, priceTier, metrics incl sold
  const byPt = new Map<string, { groups: number; soldSum: number; withMedian: number; withMoi: number }>();
  for (const g of table.groups) {
    const pt = g.propertyType ?? "(null/overall)";
    const e = byPt.get(pt) ?? { groups: 0, soldSum: 0, withMedian: 0, withMoi: 0 };
    e.groups += 1;
    e.soldSum += g.soldCount || 0;
    if (g.medianPrice != null) e.withMedian += 1;
    if (g.moiStrict != null) e.withMoi += 1;
    byPt.set(pt, e);
  }
  console.log("propertyType -> {groups, soldSum, withMedian, withMoi}:");
  for (const [pt, e] of [...byPt.entries()].sort((a, b) => b[1].soldSum - a[1].soldSum)) {
    console.log(`  ${pt}: groups=${e.groups} soldSum=${e.soldSum} withMedian=${e.withMedian} withMoi=${e.withMoi}`);
  }
  console.log("\ntable.meta:", JSON.stringify(table.meta));
  // sample a populated 2 Storey group with sold
  const samp = table.groups.find((g) => g.propertyType === "2 Storey" && g.soldCount > 5 && g.priceTier != null);
  console.log("\nsample 2 Storey group:", JSON.stringify(samp, null, 2)?.slice(0, 1800));
  // South Terwillegar (Defect 2) — look for MOI
  const st = table.groups.filter((g) => /terwillegar/i.test(g.neighbourhood));
  console.log("\nSouth Terwillegar groups:", st.map((g) => `${g.propertyType}/${g.priceTier}: sold=${g.soldCount} active=${g.activeCount} median=${g.medianPrice} moiStrict=${g.moiStrict}`).join("\n"));

  // ===== Simulate buildChunks categorization (the validator's logic) =====
  const isAttached = (pt: string) => /semi.?detached|row|townhouse|duplex/i.test(pt);
  const isApartment = (pt: string) => /apartment|condo/i.test(pt);
  const isDetached = (pt: string) => !isAttached(pt) && /detached/i.test(pt);
  const chunk = { detached: 0, attached: 0, apartment: 0, rollups: 0 };
  let chunkSoldDet = 0, chunkSoldRollups = 0;
  for (const g of table.groups) {
    if (g.neighbourhood === "All Neighbourhoods" || g.propertyType === null) { chunk.rollups++; chunkSoldRollups += g.soldCount||0; continue; }
    const pt = g.propertyType;
    if (isDetached(pt)) { chunk.detached++; chunkSoldDet += g.soldCount||0; }
    else if (isAttached(pt)) chunk.attached++;
    else if (isApartment(pt)) chunk.apartment++;
    else { chunk.rollups++; chunkSoldRollups += g.soldCount||0; }
  }
  console.log("\n===== buildChunks SIMULATION =====");
  console.log(JSON.stringify(chunk));
  console.log(`detached chunk soldSum=${chunkSoldDet}; rollups chunk soldSum=${chunkSoldRollups}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
