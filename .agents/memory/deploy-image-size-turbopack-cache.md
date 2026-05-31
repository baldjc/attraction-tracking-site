---
name: Deploy image size vs Turbopack dev cache
description: Why autoscale publish fails with "image size is over the limit of 8 GiB" and the build-command fix
---

# Autoscale deploy: 8 GiB image limit blown by Turbopack `.next/dev` cache

Replit autoscale publish snapshots the **whole workspace** into the image, then runs
the build command, then pushes the "Repl layer". The Next.js dev server (`next dev`,
Turbopack) writes a cache under `.next/dev` that grows continuously during a long
working session and can reach multiple GiB (seen at 5.5 GiB). Even though `/.next/`
is in `.gitignore`, that cache ends up in the published image and can push it past
Cloud Run's hard **8 GiB** limit. The failure surfaces at the very end of the build
("Created Repl layer" → `error: image size is over the limit of 8 GiB`), AFTER a
fully successful compile — so it is NOT a code/compile error.

Tell: earlier publishes the same day succeed, then a later one fails on image size
with no code change — the dev cache simply grew across the session.

**Fix (durable):** the production build script must delete the dev cache before
building, e.g. `rm -rf .next/dev .next/cache && prisma generate && next build`.
`next build` never creates `.next/dev` (only `next dev` does), so removing it at the
start of the deploy build guarantees the pushed layer carries only production output
(~180 MiB) instead of the multi-GiB dev cache.

**Why:** the deploy build runs before the Repl layer is pushed, so cleaning inside
the build command is sufficient — no `.dockerignore`/`.replitignore` needed (Replit
docs don't confirm those are honored for deploy images anyway).

**How to apply:** if a Next.js + Turbopack app on autoscale fails publish with the
8 GiB image-size error and the build itself compiled fine, check `du -sh .next/dev`
first; prepend the `rm -rf .next/dev .next/cache` clean to the `build` npm script.
Other non-gitignored dev-only dirs (`.local`, `artifacts/<sandbox>/node_modules`,
`.cache`) add a few hundred MiB but are rarely the decisive factor — the dev cache is.
