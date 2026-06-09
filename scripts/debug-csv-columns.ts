import prisma from "@/lib/prisma";
import { readUploadFile } from "@/lib/market-csv";
import { parseCsvRecords, detectDelimiter } from "@/lib/csv-parse-options";

async function main() {
  const userId = "1d08f47e-af3e-4b1c-a47c-715d69c77b62";
  const ups = await prisma.marketDataUpload.findMany({
    where: { userId },
    orderBy: { uploadedAt: "asc" },
    select: { id: true, monthYear: true, csvStorageUrl: true, csvFileName: true, status: true, uploadedAt: true },
  });
  for (const up of ups) {
    console.log(`\n############ ${up.monthYear} (${up.status}) uploadedAt=${up.uploadedAt.toISOString()} ############`);
    console.log(`file=${up.csvFileName}`);
    // MarketFact neighbourhoods produced by THIS upload
    const facts = await prisma.marketFact.findMany({
      where: { userId, uploadId: up.id }, distinct: ["neighbourhood"], select: { neighbourhood: true },
    });
    const fnames = facts.map(f=>f.neighbourhood).sort();
    const fnum = fnames.filter(n=>/^\d+$/.test(n)).length;
    console.log(`MarketFact distinct: ${fnames.length} (numeric:${fnum}) -> ${fnames.slice(0,15).map(n=>`"${n}"`).join(", ")}`);
    const ag = await prisma.aggregatedMetric.findMany({
      where: { userId, uploadId: up.id }, distinct: ["neighbourhood"], select: { neighbourhood: true },
    });
    const anum = ag.map(a=>a.neighbourhood).filter(n=>/^\d+$/.test(n)).length;
    console.log(`AggregatedMetric distinct: ${ag.length} (numeric:${anum})`);
    if (!up.csvStorageUrl) { console.log("(no csv stored)"); continue; }
    try {
      const buf = await readUploadFile(up.csvStorageUrl);
      const text = buf.toString("utf8");
      const rows = parseCsvRecords<string[]>(text, { delimiter: detectDelimiter(text) });
      const header = rows[0];
      console.log(`HEADERS(${header.length}): ${header.map(h=>`"${h}"`).join(", ")}`);
      const ci = header.findIndex(h=>/^community$/i.test(h));
      const si = header.findIndex(h=>/subdiv/i.test(h));
      const body = rows.slice(1);
      for (const [label, idx] of [["Community", ci], ["Subdivision Name", si]] as [string,number][]) {
        if (idx < 0) { console.log(`  col "${label}": NOT PRESENT`); continue; }
        const vals = body.map(r=>(r[idx]??"").trim()).filter(v=>v);
        const d = Array.from(new Set(vals));
        const num = d.filter(v=>/^\d+$/.test(v)).length;
        console.log(`  col "${label}"[${idx}]: ${d.length} distinct, ${num} numeric -> ${d.slice(0,12).map(v=>`"${v}"`).join(", ")}`);
      }
    } catch(e){ console.log("CSV read error:", (e as Error).message); }
  }
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
