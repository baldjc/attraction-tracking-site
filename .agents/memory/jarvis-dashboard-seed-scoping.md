---
name: Jarvis dashboard seed scoping
description: Why the Dashboard→Jarvis "Build a script" hand-off seed must be member-scoped and consumed unconditionally
---

The Dashboard "Build a script" CTA hands a one-shot prompt to JarvisChat via
sessionStorage, then routes to `/member/jarvis?thread=new`.

**Rule:** the seed must be (1) member-scoped and (2) consumed (read+remove)
unconditionally on mount; only auto-send when the stored memberId matches the
current member AND the thread is empty.

**Why:**
- `sessionStorage` survives the `window.location.reload()` that admin
  impersonation switches do, so a bare-string seed leaks into the next member's
  Jarvis. Storing `{memberId, prompt}` and gating the send on a memberId match
  prevents cross-member leakage.
- The old effect bailed (`if initialMessages.length>0 return`) BEFORE removing
  the seed, so when the dashboard routed to the bare `/member/jarvis` (no param)
  it landed on the most-recent populated thread, never cleared the seed, and the
  seed then fired into the next `?thread=new`. Fix: consume always (clears stale/
  foreign seeds either way), send only conditionally.
- `newConversation()` must `clearJarvisSeed()` before reset, or an explicit
  "+ New conversation" can replay a leftover dashboard prompt.

**How to apply:** seed helpers live in `src/lib/jarvis/seed.ts`
(`writeJarvisSeed`/`consumeJarvisSeed`/`clearJarvisSeed`). The dashboard must
route to the explicit `?thread=new` sentinel (not bare `/member/jarvis`) so the
empty-thread state is honored and the page doesn't rehydrate the latest thread.
JarvisChat needs `memberId` passed from the impersonation-aware server page.
