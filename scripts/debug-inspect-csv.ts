import prisma from "@/lib/prisma";
import { readUploadFile, parseCsvPreview } from "@/lib/market-csv";

async function main() {
  const uploadId = process.argv[2];
  if (!uploadId) throw new Error("usage: debug-inspect-csv <uploadId> [statusColumn]");
  const statusCol = process.argv[3];
  const up = await prisma.marketDataUpload.findUnique({
    where: { id: uploadId },
    select: { csvStorageUrl: true, rowCount: true, csvFileName: true },
  });
  if (!up?.csvStorageUrl) throw new Error("no csvStorageUrl");
  const buf = await readUploadFile(up.csvStorageUrl);
  const preview = parseCsvPreview(buf);
  console.log("csvFileName:", up.csvFileName);
  console.log("rowCount:", up.rowCount);
  console.log("HEADERS:", JSON.stringify(preview.headers));
  if (statusCol) {
    const text = buf.toString("utf8");
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
    const header = preview.headers;
    const idx = header.indexOf(statusCol);
    console.log(`status column "${statusCol}" index:`, idx);
    if (idx >= 0) {
      // naive CSV split is fine for a value-distribution probe
      const counts = new Map<string, number>();
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(",");
        const v = (cells[idx] ?? "").trim();
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
      console.log(`distinct values in "${statusCol}" (top 25):`);
      for (const [v, c] of sorted) console.log(`  ${JSON.stringify(v)}: ${c}`);
    }
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
