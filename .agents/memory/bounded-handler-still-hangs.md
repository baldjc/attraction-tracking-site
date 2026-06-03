---
name: Bounded handler still "hangs" → request isn't reaching that artifact
description: How to diagnose a route that has correct timeout bounds yet a client still reports a multi-second hang with no server response.
---

# Symptom
A route is fully bounded (per-await `withTimeout` + one outer overall `withTimeout` wrapping the whole flow), yet a client reports the request "hangs" for ~40s then the client AbortController cancels with 0 bytes from the server.

# The decisive reasoning
If the handler actually executes, a complete bounding model makes a client-visible 40s hang **impossible**: each phase throws a bounded error (e.g. 503/408) and the overall bound returns 504 — and *every* one of those paths logs. So a hang with **zero per-request server logs** means the failing request **never executed that handler version**. Do NOT keep adding more in-handler timers — they can't fix a request that isn't running the handler.

# How to prove it (cheapest → most definitive)
1. **Artifact lineage, not git claims.** `git log --oneline -S "<fix-token>" -- <file>` to find the fix commit, then confirm the most recent "Published your App" commit is a *descendant* of it. Autoscale `build = npm run build` rebuilds from the published commit, so a publish after the fix → fix is in the artifact.
2. **Direct prod curl** of the route (the prod URL is `AUTH_URL` in `.replit` `[userenv.shared]`): an unauth POST that early-returns 401 *with a large body* proves the handler is reachable, body delivery works, middleware doesn't intercept, and responses flush.
3. **Process/event-loop health**: other periodic logs (schedulers, click tracking) continuing for minutes around the incident prove the process didn't crash and timers *would* fire — so a "no timer fired" hang is not event-loop death.
4. **Per-request log presence**: filter deployment logs by the route's log prefix over a wide window. No line for the user's attempt ⇒ the request didn't reach this handler (stalled above the app, OR the user simply hasn't retried since the fix deployed and the "evidence" predates it).

# The fix that makes future repros unambiguous (instead of speculative rewrites)
Add, before any `await`, an **entry log** with a bumped `ROUTE_BUILD_TAG` + `content-length`/`content-type`, and stamp **every** response (success + error) with `x-…-ticket` and `x-…-build` headers. Next real attempt then proves: handler entered (entry line), live artifact (build tag), body arrived (content-length), and maps the user's report to logs via the ticket. A 40s hang with NO entry line = stall above the app (proxy/body ingress), not the handler.

**Why:** repeatedly hardening a provably-correct handler wasted cycles; the gap was *observability of which artifact ran*, not the timeout logic. `withTimeout` only bounds *when the handler returns* — it never cancels the underlying work, so a 504 can coexist with background work still running.
