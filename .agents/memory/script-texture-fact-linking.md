---
name: Linking texture-only facts to a plan
description: Why on-demand/member-provided facts must be linked server-side, not via the public PATCH facts route
---

The public link route `PATCH /api/member/content-plans/[id]/facts` only links facts
whose `usageClass === "headline_safe"` (it validates ownership AND headline-safe
before adding). On-demand-extracted and member-provided facts are
`supporting_texture_only`, so that route SILENTLY DROPS them.

**Rule:** any new fact source that is not headline-safe must link itself to the
plan directly (server-side, ownership-scoped) inside its own route — never expect
the FactPickerModal / PATCH path to link it.

**Why:** the on-demand "Run data search" and "Tell me what's missing" gate CTAs
create texture-only facts; if they relied on the PATCH route the gate would never
clear (count never increments) and the member would be stuck on the block banner.

**How to apply:** the extract route links the new fact after a successful
extraction; the manual route links right after create. The generate/save routes
count `linkedFactIds` with NO usageClass filter, so texture-only linked facts do
pass the min-linked-facts gate end-to-end — only the PATCH link path is restrictive.

**Related cost-cap note:** the extract route's per-request `maxCostUsd` is
clamped to a server constant (`Math.min(client, SERVER_MAX)`) — a client may
request a tighter budget but never a looser one, or it could neuter the
extractor's per-request gate. The monthly hard cap (getCostCapStatus) is the
independent server-authoritative bound.

**Context-window vs cost cap:** the per-request COST cap ($1) is looser than
Claude's 200K-token INPUT window. Market-wide needs (null neighbourhood) match
the ENTIRE CSV (~10K rows), which clears the cost gate but 400s with "prompt is
too long". The extractor must bound serialized rows to a safe token budget
(SAFE_PROMPT_INPUT_TOKENS, well under 200K) and evenly-sample down when the
in-scope slice is larger — a cost gate passing does NOT imply the prompt fits.
