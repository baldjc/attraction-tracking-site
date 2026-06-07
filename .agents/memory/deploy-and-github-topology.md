---
name: Deploy + GitHub topology
description: How this repl reaches production, GitHub's role, and the main-agent git-push guard quirk. Read before any "get this live / push to GitHub / migrate prod" request.
---

# Production = Replit VM publish; GitHub is source-of-record only

- **Production is a Replit VM deployment** at `members.attractionbyvideo.com`
  (also `attraction-tracking-site.replit.app`). `.replit` `[deployment]`:
  target `vm`, run `npm run worker & exec npm run start`, build
  `rm -rf .next/dev .next/cache && prisma generate && next build`.
- **"Merged in the workspace" ≠ live.** Getting code live requires the user to
  click **Publish**, which rebuilds the VM from current main. The agent cannot
  publish — use `suggestDeploy()` / `suggest_deploy`.
- **The deploy runs NO migrations.** Build is `prisma generate` + `next build`
  only. Combined with the shared Neon DB (see dev-vs-prod-database.md), schema is
  already live the moment a dev migration is applied — there is nothing to run at
  publish and no data-loss window from publishing.
- **GitHub `baldjc/attraction-tracking-site` main is source-of-record only.** It
  does NOT trigger any deploy. Jared treats it as the canonical record, so "push
  to GitHub" is a separate explicit step from "deploy". The `origin` remote has an
  embedded PAT in `.git/config`.

## Main-agent git-push guard quirk
- The bash sandbox blocks the main agent from touching `.git` (e.g. `rm` of a
  stale `.git/refs/remotes/origin/main.lock` is rejected as a "destructive git
  operation").
- BUT a plain non-force `git push origin main` **does run and succeeds** — the
  remote updates (`<old>..<new> main -> main`). It then prints a non-fatal
  `update_ref failed ... cannot lock ref refs/remotes/origin/main` because the
  stale lock blocks updating the LOCAL tracking ref. **The push to GitHub still
  landed** — verify with `git ls-remote origin refs/heads/main`, not the local
  `origin/main`.
- **Why:** the leftover lock only affects local bookkeeping, not the wire push.
- **How to apply:** after pushing, confirm via `ls-remote`; ignore the local
  tracking-ref lock error. Don't try to `rm` the lock (blocked) and don't
  force-push to "fix" it.

## Smoke-checking a member route without credentials
- Member pages 307-redirect to login when unauthenticated, so you can't see the
  UI. But a route that **does not exist yet returns 404**; once shipped it
  returns **307** (redirect to login). So `curl -o /dev/null -w "%{http_code}"
  https://members.attractionbyvideo.com/member/<route>` flipping 404→307 proves
  the new build shipped that route. Full UI/flow checks still need an
  authenticated (allowlisted) session.
