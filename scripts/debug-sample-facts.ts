import prisma from "@/lib/prisma";
async function main() {
  const facts = await prisma.marketFact.findMany({
    where: { uploadId: "9532619e-eca5-48ac-96e2-f4cfe3abf4eb" },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Total: ${facts.length}`);
  const sample = [facts[0], facts[Math.floor(facts.length / 4)], facts[Math.floor(facts.length / 2)], facts[Math.floor(facts.length * 3 / 4)], facts[facts.length - 1]];
  for (const f of sample) {
    if (!f) continue;
    console.log(JSON.stringify({
      neighbourhood: f.neighbourhood,
      metricName: f.metricName,
      metricFamily: f.metricFamily,
      metricValue: f.metricValue,
      sampleSize: f.sampleSize,
      usageClass: f.usageClass,
      marketType: f.marketType,
      moiStrict: f.moiStrict,
      moiInclusive: f.moiInclusive,
      domMedian: f.domMedian,
      domAverage: f.domAverage,
      crebDeltaEstimate: f.crebDeltaEstimate?.slice(0, 60),
      usageNotes: f.usageNotes?.slice(0, 100),
    }, null, 2));
  }
}
main().finally(async () => { await prisma.$disconnect(); });
