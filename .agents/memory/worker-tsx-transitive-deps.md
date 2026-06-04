---
name: Worker (tsx) needs transitive deps the Next bundler hides
description: Why the durable-queue worker can throw "Cannot find module X" in prod while the web app works fine.
---

# The web app bundles; the worker does raw Node resolution

The Next.js web app is **bundled at build time** (`next build`), so transitive
dependencies of server code get inlined and always resolve at runtime. The durable
job **worker** runs the SAME `src/lib/*` code via **`tsx` (no bundling)**, so it relies
on plain Node module resolution against the deployed `node_modules`.

**Symptom seen:** a `validate-upload` job failed in prod with
`Error: Cannot find module 'whatwg-url'` (stack went through `tsx`'s
`resolveTsPaths`), require chain `@replit/object-storage` → `@google-cloud/storage`
→ gaxios/teeny-request → `node-fetch@2.7.0` → `whatwg-url@^5`. The web app never hit
this because Next bundled `whatwg-url` into the server build. Dev didn't repro because
the dev `node_modules` had `whatwg-url` hoisted to top-level.

**Rule:** any package that ONLY the worker loads at runtime (object storage, CSV
parsing, Anthropic SDK paths, etc.) must have its required transitive deps resolvable
in the deployed tree. When a transitive dep is only present via hoisting/dedupe and the
worker throws "Cannot find module", **promote it to a direct `dependencies` entry** at
the version the consumer needs (here `whatwg-url@^5.0.0`, matching node-fetch@2.7.0).

**Why:** a direct dependency is deterministically installed and hoisted to top-level
`node_modules` in every install mode (including prod-only installs), so raw Node/`tsx`
resolution finds it regardless of how dedupe shaped the tree.

**How to apply / verify:**
- Reproduce the worker path specifically (not just `import('@replit/object-storage')`
  from root — that can take a different, working tsx resolution path). Load it through
  the worker's `@/` alias: `printf "import '@/lib/market-csv';" > x.ts && npx tsx x.ts`.
- The fix only takes effect in prod after a **republish** — the deployed VM's
  `node_modules` is baked at build time; editing package.json in dev does nothing to the
  running deployment until it is rebuilt.
- If more "Cannot find module" surface after fixing one, they're the same class — add
  each as a direct dep. The error's require-stack tells you the last module that DID
  resolve; the missing one is its declared dependency.
