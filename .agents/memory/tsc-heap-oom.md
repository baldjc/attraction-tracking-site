---
name: tsc OOMs at default Node heap
description: Project-wide type-check needs an enlarged heap that still fits free RAM, and must run as a console workflow.
---

`npx tsc --noEmit` on this repo exhausts the default Node old-space (~2 GB) and aborts
with `FATAL ERROR: Ineffective mark-compacts near heap limit ... heap out of memory`
(exit 134) — which looks like a crash, not a type error.

**Fix:** run with an enlarged heap, e.g.
`NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit`.

**Why:** the generated Prisma client + Next.js app graph is large; default heap is too small.

**Two gotchas that make this look like a hang/crash:**
- **The heap ceiling must fit *available* RAM, not the 7.7 GB total.** With `next dev`
  running there is often only a few hundred MB free, so even a "successful" tsc gets
  kernel-OOM-killed (whole process group dies, no done-file). Stop `next dev` first
  (`pkill -f "next dev"`), then size the heap to free RAM — ~4096 fits the ~4.6 GB free
  after stopping the server; 7168 only works when the box is otherwise idle.
- **Detached `setsid`/`nohup` background tsc gets reaped by the bash tool** between
  calls (no done-file ever appears). Run it as a **console workflow** instead
  (`configureWorkflow({name:"tsc check", outputType:"console", command:"… tsc … ; echo EXIT:$? > done"})`),
  poll the done-file, then `removeWorkflow`.

**How to apply:** any full-project `tsc` verification = stop the dev server, run tsc in a
console workflow with `--max-old-space-size` sized to free RAM, read the result file,
remove the temp workflow, restart `Start application`.
