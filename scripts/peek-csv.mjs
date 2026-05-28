import { Client } from "@replit/object-storage";
const client = new Client({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID });
const keys = {
  "2026-02": "market-data/c3d00532-9a60-47cd-9287-66c4f5ea864f/af19116b-3d9a-4734-9dbc-c3cab0e70623.csv",
  "2026-03": "market-data/c3d00532-9a60-47cd-9287-66c4f5ea864f/1b2fbb7d-4ff9-44a6-b753-aafbf2492e37.csv",
  "2026-05": "market-data/c3d00532-9a60-47cd-9287-66c4f5ea864f/9e31bf4a-e11c-429e-a2a1-db7b742620e3.csv",
};
for (const [month, key] of Object.entries(keys)) {
  const res = await client.downloadAsBytes(key);
  if (!res.ok) { console.log(month, "ERROR:", res.error); continue; }
  const bytes = res.value;
  const buf = Array.isArray(bytes) ? Buffer.concat(bytes.map(b => Buffer.from(b))) : Buffer.from(bytes);
  const text = buf.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  const header = lines[0];
  const cols = header.split(",").map(s => s.replace(/^"|"$/g, "").trim());
  const statusIdx = cols.findIndex(c => c.toLowerCase() === "status");
  console.log(`\n=== ${month} (${lines.length} lines) ===`);
  console.log("header columns:", cols.slice(0, 20).join(" | "));
  console.log("status column index:", statusIdx);
  if (statusIdx >= 0) {
    // count unique status values from first 500 data rows (cheap parse, assumes no embedded commas in status col)
    const sample = {};
    for (let i = 1; i < Math.min(lines.length, 1000); i++) {
      const line = lines[i];
      if (!line) continue;
      // Simple CSV split — handle quoted fields
      const fields = [];
      let cur = "", inQ = false;
      for (const ch of line) {
        if (ch === '"') inQ = !inQ;
        else if (ch === "," && !inQ) { fields.push(cur); cur = ""; }
        else cur += ch;
      }
      fields.push(cur);
      const v = (fields[statusIdx] ?? "").trim();
      sample[v] = (sample[v] ?? 0) + 1;
    }
    console.log("status value distribution (first 999 rows):", sample);
  }
}
