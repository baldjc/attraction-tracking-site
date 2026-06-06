---
name: Jarvis grounding vs script SoT scope mismatch
description: Why Jarvis chat prose redacted numbers the script cited, and the rules for grounding + source counting.
---

# Jarvis conversational grounding redacts numbers the script legitimately cites

Jarvis runs conversational prose (pre-draft summary card, chat hooks) through a
grounder that strips any currency/percent/decimal token whose digits aren't in
an allowed set. The allowed set was built ONLY from the get_facts ledger.

**The trap:** the script-build step additionally resolves & cites
source-of-truth (SoT) aggregates (median sale price, sale-to-list ratio) that
NEVER enter the get_facts ledger. So the prose grounder redacted the very
metrics the script below it grounded and cited — root cause is a number-set
*scope* mismatch, not a label/format mismatch.

**Rules (all must hold):**
- The grounder must take the proposal's cited `## Sources` footnote as a second
  allowlist source (its numbers survive in prose). Pass ONLY the extracted
  footnote, never the whole script — a malformed/missing footnote would
  otherwise implicitly whitelist every body number (over-permit).
- Untraceable tokens must be OMITTED (replaced with ""), never rendered as a
  literal placeholder like "[unverified]". Members must never see the token.
- The tidy step that cleans holes left by omission must collapse only INTERNAL
  space runs (` {2,}(?=\S)`). JarvisChat renders via react-markdown, so a
  trailing `"  \n"` is a hard break — never strip end-of-line whitespace.

**Proposal "sources cited" count:** the card count must equal the distinct
deduped bullets in the script's `## Sources` block (`countCitedSources`), NOT
`linkedFactIds.length` (which undercounts — SoT aggregates aren't linked facts).
Persist it on the proposal; UI falls back to `linkedFactIds.length` when the
stored count is absent (legacy proposals) or 0 (parser miss) via `|| `.

**Known limitation:** when no proposal is built THIS turn (cross-turn
follow-up), SoT numbers from a previously-proposed script aren't in the
allowlist, so follow-up prose can still omit them (never as a placeholder —
acceptance still holds). Fixing fully would require persisting SoT numbers into
the cross-turn ledger.

**TS gotcha:** `proposal` is assigned via the `onProposal` callback, which
control-flow analysis can't see, so TS narrows it to `null` and `proposal?.x`
errors with "Property x does not exist on type never". Break it with a cast
(`proposal as ProposalState | null`); an annotated local is not enough.
