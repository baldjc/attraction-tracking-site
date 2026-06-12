// TEMPORARY read-only CSV inspection (deleted after). No mutations, no AI, no cost.
// Re-check using the CSV's ACTUAL headers (spaced human format) to confirm the
// May-2025 file genuinely carries sold rows + prices — i.e. the only blocker is a
// column-mapping mismatch, not bad data.

import prisma from "@/lib/prisma";
import { readUploadFile } from "@/lib/market-csv";
import { parseCsvRecords } from "@/lib/csv-parse-options";

const UPLOAD_ID = "f8559ec8-f3d3-4aa0-9c7a-ffc270e3376d";

// Mapping that matches THIS file's actual headers.
const ACTUAL = {
  status: "Status",
  salePrice: "Close Price",
  listPrice: "List Price",
  date: "Close Date",
  neighbourhood: "Subdivision",
  propertyType: "Subtype",
  mlsNumber: "MLS#",
  daysOnMarket: "DOM",
  saleToListRatio: "SP/LP",
} as const;

function tally(values: (string | undefined)[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = (v ?? "").trim();
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

async function main() {
  const upload = await prisma.marketDataUpload.findUnique({
    where: { id: UPLOAD_ID },
    select: { csvStorageUrl: true },
  });
  if (!upload?.csvStorageUrl) throw new Error("no csv");

  const buf = await readUploadFile(upload.csvStorageUrl);
  const rows = parseCsvRecords<Record<string, string>>(buf.toString("utf8"), {
    columns: true,
  });
  console.log("parsed rows:", rows.length);

  console.log("\n=== Status distribution (actual 'Status' col) ===");
  const statusTally = tally(rows.map((r) => r[ACTUAL.status]));
  for (const [k, n] of [...statusTally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${JSON.stringify(k)} : ${n}`);
  }

  const num = (s: string | undefined) => {
    const v = (s ?? "").replace(/[^0-9.]/g, "");
    return v.length ? Number(v) : NaN;
  };
  const withPrice = rows.filter((r) => num(r[ACTUAL.salePrice]) > 0);
  console.log(`\nrows with usable 'Close Price' (>0): ${withPrice.length}`);

  const soldish = rows.filter((r) => {
    const s = (r[ACTUAL.status] ?? "").toLowerCase();
    return /sold|closed|firm|^s$/.test(s) && num(r[ACTUAL.salePrice]) > 0;
  });
  console.log(`sold-status rows WITH a close price: ${soldish.length}`);

  console.log("\n=== Close Date month coverage (top 12) ===");
  const monthOf = (s: string) => {
    const d = new Date(s);
    return isNaN(d.getTime())
      ? `raw:${(s || "").slice(0, 10)}`
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const monthTally = tally(rows.map((r) => (r[ACTUAL.date] ? monthOf(r[ACTUAL.date]) : "")));
  for (const [k, n] of [...monthTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${k} : ${n}`);
  }

  console.log("\n=== Subdivision / Subtype cardinality ===");
  console.log("distinct subdivisions:", tally(rows.map((r) => r[ACTUAL.neighbourhood])).size);
  const typeTally = tally(rows.map((r) => r[ACTUAL.propertyType]));
  console.log("distinct subtypes:", typeTally.size);
  for (const [k, n] of [...typeTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${JSON.stringify(k)} : ${n}`);
  }

  console.log("\n=== sample sold row ===");
  const sample = soldish[0];
  if (sample) {
    for (const [field, col] of Object.entries(ACTUAL)) {
      console.log(`  ${field} (${col}): ${JSON.stringify(sample[col])}`);
    }
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
