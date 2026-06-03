---
name: Offline validator / long-running maintenance runner on Replit
description: How to run a long-lived offline job (e.g. the market-data validator pipeline) so it survives, and why naive backgrounding/OOM kills it.
---

# Running long-lived offline jobs (validator recovery, backfills) on Replit

When you need to run the full `runValidation(uploadId)` pipeline (or any multi-minute
job) outside the HTTP path — e.g. to recover uploads stuck in `validating` — run it as a
**pid1-managed console workflow** (`configureWorkflow({ outputType: "console", ... })`),
poll `getWorkflowStatus` until `state === "finished"`, then `removeWorkflow`.

**Why:** `nohup ... &` and `setsid` background processes launched from the bash tool get
**reaped when the launching bash command returns** — the bash tool cleans up processes
spawned within a command (per-command cgroup; a new session/`setsid` does not escape it).
Symptom: the job dies seconds after launch with **no JS error in the log**, and naive
`pgrep -f "<script> <id>"` monitoring gives false "alive" because the poll command's own
argv contains the search string. If you must scan, only inspect **node** process cmdlines
(`for p in $(pgrep node); do tr '\0' ' ' </proc/$p/cmdline | grep -q "<marker>"; done`) so
a bash poll can't self-match. A pid1 workflow sidesteps all of this.

**Memory / OOM:** the validator fans out several concurrent 64K-output Anthropic streams
(`FACT_CALL_CONCURRENCY=4` + summary) plus large message strings. The container cgroup cap
is ~8 GiB; a resident `next dev` server alone is ~2.9 GiB RSS. Running the offline job
alongside it pushes past 8 GiB → the kernel **OOM-kills the offline process silently**
(SIGKILL, no stack trace — looks identical to the bash-reap death, distinguish by how far
the log got: OOM dies mid-AI-calls, reap dies at launch). Fix: stop the dev workflow(s) to
free RAM before the run (`removeWorkflow("Start application")`, recreate it after), and pass
`NODE_OPTIONS=--max-old-space-size=4096`. Do NOT lower `FACT_CALL_CONCURRENCY` — that edits
the validator/methodology code path.

**Timing:** wide markets serialize. With concurrency 4, extra rollups sub-chunks can't
start until an in-flight 64K-output call returns (~1 min each), so a ~3.4k-row upload ran
~5.5 min and a ~9.5k-row wide upload ~10 min (21 calls). Don't mistake this for a hang.

**Legit zero metrics:** if aggregation reports `totalSold=0` for a CSV, the methodology
persists 0 aggregated_metrics and 0 leads even though facts are produced — that's faithful
output, not a recovery bug.
