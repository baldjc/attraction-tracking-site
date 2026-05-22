import { readFileSync } from "node:fs";
import { parseValidatorOutput } from "@/lib/fact-validator-parser";

const path = process.argv[2] ?? "/tmp/validator-raw-8837680a-3c9f-4d8d-b9c9-630506d64990.md";
const md = readFileSync(path, "utf8");
const parsed = parseValidatorOutput(md);
console.log(`Facts: ${parsed.facts.length}, Leads: ${parsed.storyLeads.length}`);
console.log("---- 5 sample facts ----");
const pickIdx = [
  0,
  Math.floor(parsed.facts.length / 4),
  Math.floor(parsed.facts.length / 2),
  Math.floor((parsed.facts.length * 3) / 4),
  parsed.facts.length - 1,
];
for (const i of pickIdx) {
  const f = parsed.facts[i];
  if (!f) continue;
  console.log(JSON.stringify({
    idx: i,
    nh: f.neighbourhood,
    metricName: f.metricName,
    family: f.metricFamily,
    val: f.metricValue,
    n: f.sampleSize,
    usageClass: f.usageClass,
    moiStrict: f.moiStrict,
    moiInclusive: f.moiInclusive,
    domMedian: f.domMedian,
    domAverage: f.domAverage,
    usageNotes: f.usageNotes?.slice(0, 80),
  }));
}
