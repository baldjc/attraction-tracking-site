---
name: Briefing single-flight lease
description: How the per-member/month cached LLM briefing avoids duplicate generation + double-charge under concurrency.
---

# Cached LLM briefing: single-flight + lease-guarded finalize

A per-(user, month) cached briefing whose cold generation is a long (~50s)
multi-call Claude job must not be generated twice concurrently (double Claude
spend + duplicate usage logs + row clobber).

**Rule:**
- Treat an empty `ideas` array as "claimed, generating" — a row is only a real
  cache hit once `ideas` is non-empty. Do NOT treat a same-upload row as ready
  on uploadId match alone.
- One request wins the work via a placeholder insert guarded by the
  `@@unique([userId, monthYear])` index. Losers (unique-violation) either serve
  a now-ready row or return a `generating` pending state; the client polls.
- Capture a **lease token = the claimed row's `generatedAt`**. Take-over of a
  stale (>5min empty) or upload-changed claim is an `updateMany` guarded on the
  prior `generatedAt`, and the new `generatedAt` becomes the taker's lease.
- **Finalize is lease-guarded**: write the result with `updateMany WHERE
  generatedAt = leaseToken`. If `count===0`, a concurrent takeover stole the
  claim mid-flight — discard (no overwrite), return pending.
- **Charge once**: `logUsage` on the success path only AFTER the guarded
  finalize succeeds, so a lost-lease (discarded) generation never bills.
- Failure path releases only its own lease (`deleteMany WHERE generatedAt =
  leaseToken`) so the next load retries instead of stranding a placeholder.

**Why:** Without the lease guard, a request whose claim was taken over (upload
changed while it generated) would still run an unconditional `update()` —
overwriting the new owner's row and double-charging. The unique-index claim
alone only covers the same-upload cold-start race, not the takeover race.

**How to apply:** Any "generate-once, cache per key, expensive LLM job behind a
unique key" endpoint. Don't move bulk writes into an interactive transaction
(see fact-validator-persistence-tx). A single global DATABASE_URL means dev and
prod read the same row — verify which DB before trusting a cache hit.
