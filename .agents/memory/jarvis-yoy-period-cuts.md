---
name: Jarvis YoY / period-aware cuts
description: How prior-year & period-targeted on-demand cuts are grounded; the non-obvious wiring/grounding traps.
---

Jarvis can compute prior-period and year-over-year cuts on demand from a member's
historical uploads (`runComputeCut` with optional `monthYear`, and `runYoYCut`).

**Grounding rule (absolute):** never state a prior-year number or a YoY change the
tool didn't return. Both period endpoints are persisted as real citable facts; a
delta is only produced when BOTH periods are headline/disclose-usable. Missing
comparison → `no_comparison` that lists the months that DO exist; never fabricate a
baseline.

**Trap 1 — computed deltas are NOT ledger facts.** A YoY `%` delta is derived from
two endpoint facts but is itself not in the get_facts ledger, so `groundAssistantText`
will REDACT it unless it's whitelisted. The orchestrator collects delta strings via an
`allowText` side-channel and feeds them into the grounding allowlist (same mechanism as
the script "## Sources" footnote and research stats). **Why:** grounding only keeps
numbers present in fact values or explicitly-allowed text; forget this and the live
answer silently loses the very change Jarvis computed.
**How to apply:** any future server-computed-but-not-a-fact number Jarvis is allowed to
say must be routed through the grounding allowlist, or it gets stripped.

**Trap 2 — orchestrator must forward every new arg AND every structured result field.**
Adding `monthYear` to a tool schema/executor does nothing until the orchestrator branch
actually passes `input.monthYear` through, and a structured result (e.g. `deltas`,
`comparisonIsFallback`, `availableMonths`) is invisible to the model unless it's put in
the tool_result payload — otherwise the model is forced to scrape the prose note.
**How to apply:** when extending a Jarvis tool, change schema + args interface +
executor + orchestrator passthrough + orchestrator payload in lockstep.

**Floor governs HEADLINE eligibility, NOT whether Jarvis shows a member their own
data.** `compute_yoy_cut` is a conversational lookup tool (script generation uses a
separate SoT-injection path), so it now computes a delta for EVERY group present in
BOTH periods — including thin ones below the hard sample floor — and flags them
`isThinSample` so they're labelled "small sample — directional only" instead of being
withheld. A thin sample must NEVER produce a refusal ("can't be reliably run / here
are some options"); the caveat rides alongside the real number.
**Why:** the headline floor exists to stop a thin neighbourhood from headlining a
video, not to hide a member's own market figures when they ask a direct question.
Withholding thin YoY deltas read as a refusal to members.
**How to apply:** `no_comparison` must mean ONLY "no prior period / older upload can't
support the cut" — never "sample too thin." The base `sample_too_small` early-return
fires only when the base period has zero `coreGroups` (genuinely no data). No-fabrication
intact: both endpoints are still persisted facts and `pm.value===0` is still skipped.
Keep the four surfaces in lockstep: delta loop + note text (computeCut.ts), orchestrator
payload field, the tool description, and the system prompt's YEAR-OVER-YEAR section.

**Comparison-period selection:** exact 12-months-prior if uploaded, else nearest
available STRICTLY-prior period (ties → further back), flagged `comparisonIsFallback`
so the assistant says the window out loud. Per-period column resolution means an older
upload in a different export format may not support the cut — that degrades to
`no_comparison` (base facts still returned) rather than fabricating.
