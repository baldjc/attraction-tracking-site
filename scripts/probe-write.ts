import { Client } from "@replit/object-storage";
import { writeFileSync } from "node:fs";

async function main() {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID!;
  const client = new Client({ bucketId });
  const ts = Date.now();
  const key = `market-data/__durability-probe__/${ts}.txt`;
  const content = `probe-${ts}`;
  const up = await client.uploadFromText(key, content);
  if (!up.ok) { console.error("WRITE FAIL", up.error); process.exit(1); }
  console.log("WROTE", key, "=", content);
  writeFileSync("/tmp/probe-state.json", JSON.stringify({ key, content }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
