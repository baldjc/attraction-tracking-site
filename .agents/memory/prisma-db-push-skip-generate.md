---
name: prisma db push --skip-generate no-op
description: A Prisma schema push gotcha that silently fails to apply the migration in this repo.
---

# `prisma db push --skip-generate` prints help and does NOT apply

When applying a `schema.prisma` change in this repo, `npx prisma db push --skip-generate`
printed the CLI help text and did **not** push the schema to the database (no column
created). Plain `npx prisma db push` (then a separate `npx prisma generate`, or letting
push regenerate) worked.

**Why:** unclear (flag parsing / Prisma v7 CLI behavior in this environment), but the
failure is silent — it looks like it ran but the column never appears, so the next
runtime query throws "Unknown argument <field>" or the column is simply missing.

**How to apply:** to apply a schema change, run plain `npx prisma db push` (no
`--skip-generate`). Verify the column actually exists (e.g. a quick `prisma` count
filtering on the new field) before trusting it. After a push, restart the dev workflow
so the running Next server picks up the regenerated client.
