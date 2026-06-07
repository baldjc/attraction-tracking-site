---
name: Market-update length-floor enforcement sites
description: Where the market-update dialogue-word floor/target is encoded, and why all sites must move in lockstep.
---

# Market-update length floor lives in several places

The "how long must a market_update script be" policy is **not** in one constant — it
is spread across code threading AND two layers of prompt prose. Change the floor/target
for market updates and you must touch ALL of these or they silently contradict each other:

1. **Constants** — `script-content-rules.ts`: `MIN_DIALOGUE_WORDS` (deep-dive/profile floor)
   vs `LEAN_DIALOGUE_WORDS` (lean/market-update floor). A prior task bumped the lean floor
   1,200→1,600; a unit-test fixture (`scriptBuilder.test.ts` makeLeanScript) silently fell
   below it and started failing.
2. **Code threading** — `scriptBuilder.ts buildScript`: market updates must select the lean
   floor *even when a neighbourhood profile is loaded* (`useLeanFloor = isMarketUpdate || !hasProfile`),
   threaded as `hasNeighbourhoodProfile` into `validateScript` and as `hasProfile` into the
   retry prompt. Otherwise a profile-loaded market update is judged against the deep-dive floor.
3. **Per-call directive** — `buildUserMessage` OUTPUT instruction (3-way: market_update vs
   profile deep-dive vs lean).
4. **Cached mode prompt prose** — `script-builder-mode-prompt.ts`: the `SCRIPT LENGTH TARGET`
   section AND the self-check item. This is the easy one to miss: it historically told
   profile-loaded scripts to "target 2500-3500 words", which **contradicts** a market-update
   target of ~1,700-1,950 because Phil's market HAS a full profile. Scope the high target to
   *profile deep-dives only*, not market updates.
5. **Retry copy** — `scriptBuilder.ts` retry messages reference a "2500-word target"; gated on
   `hasProfile`, so passing `hasProfile:false` for market updates already neutralizes it. Leave
   it for deep-dives.

**Why:** "degraded" only fires when a script is too SHORT (below floor). A stale high-target
prose line won't degrade a draft — it makes the model over-write (padding above the target),
which is the opposite failure and harder to spot. The per-call OUTPUT directive and the cached
mode-prompt prose are both in context simultaneously; if they disagree, the model splits the
difference.

**How to apply:** any time the market-update length policy changes, grep the mode prompt for
hard-coded word counts (`2500`, `3500`, `1,?[0-9]00`) and reconcile every one against the new
target, then re-run the live draft (a profile-loaded market like Phil's) and confirm the result
is neither degraded nor padded far past the target.
