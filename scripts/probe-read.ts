import { Client } from "@replit/object-storage";
import { readFileSync } from "node:fs";

async function main() {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID!;
  const client = new Client({ bucketId });
  const { key, content: expected } = JSON.parse(readFileSync("/tmp/probe-state.json", "utf8"));
  const dl = await client.downloadAsText(key);
  if (!dl.ok) { console.error("READ FAIL", dl.error); process.exit(1); }
  const actual = dl.value;
  const match = actual === expected;
  console.log(`KEY=${key}`);
  console.log(`EXPECTED=${expected}`);
  console.log(`ACTUAL=${actual}`);
  console.log(`MATCH=${match}`);
  const del = await client.delete(key);
  console.log("DELETED:", del.ok);
  if (!match) process.exit(2);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
