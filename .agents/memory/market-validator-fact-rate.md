---
name: Market-data validator fact-extraction is regressed/low
description: Re-running the current validator on an upload yields far fewer facts than older runs; the per-category facts chunks return near-empty.
---

# Market-data validator extracts fewer facts than it used to

Re-validating an existing upload with the CURRENT validator code can produce a
much lower fact count than the stored value from an older run (observed: an
upload's fact count more than halved on a same-CSV re-run).

Root signal: in `runValidation` telemetry, the per-category facts chunks
(`detached` / `attached` / `apartment`) return near-empty responses
(textLen~42, facts=0); only the `rollups` chunk and `summary+leads` produce
output. So the low total is an extraction-rate problem in the per-category
facts chunks, not a persistence or re-validation bug.

**How to apply:** when a re-validation "loses" facts, this is expected current
behaviour, not a regression introduced by the re-validate button. The underlying
extraction rate is the thing to fix (separate diagnosis work).
