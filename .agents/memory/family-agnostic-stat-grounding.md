---
name: Family-agnostic stat grounding
description: How the ARC script validator grounds EVERY market number (not just known families) and why the framework exemption must exclude current-state phrasing.
---

# Family-agnostic stat grounding (ARC script validator)

The grounding rule must reject ANY market-shaped number that traces to no
fact — regardless of metric family OR number shape (comparison/temporal
"40% longer than 2024", %, $, months, days, "X-Y%" ranges, unsourced SP/LP
"100%/99%", industry-norm stats) — and force a re-prompt like an unsourced MOI.

**Rule:** `checkUnanchoredStat` must NOT gate on a same-unit anchor existing.
The old per-unit `haveAnchorsOfUnit` gate let an invented number in a family
with no matching anchor slip through both unanchored_stat AND
unlisted_market_stat. Keep that gate REMOVED in the validator.

**Why:** the channel's edge is precision; a fabricated "40% longer than 2024"
with only a currency fact present must still be caught. unanchored_stat
(no anchor match) and unlisted_market_stat (matched-but-not-in-Sources) are
mutually exclusive → together they cover every number once the gate is gone.

**autoSoftenUnanchoredStats keeps its gate** on purpose: new family-agnostic
cases route to the validator's reject+re-prompt instead of being silently
auto-softened.

**Framework exemption (`isFrameworkOrDefinitionalNumber`) must stay narrow.**
It exempts only definitional numbers: MOI band cutoffs (canonical band value +
market-type word + comparator in a 7-word window) and "100% of asking = full
price". It MUST exclude first-person current-state phrasing
(`MOI_DATA_CLAIM_OVERRIDE`: "we're/we are at|below|…", "sitting at") — otherwise
a real data claim like "we're below 2.5 months here in this sellers market"
that mismatches the SoT gets wrongly exempted (false negative).

**How to apply:** when adding a number shape, extend `extractStatTokens` (e.g.
the percent-range pattern that captures the LEADING endpoint of "15-20%"); the
rest is automatic. Keep mode-prompt (## Sources block) and audit-engine's
"Every Number Must Be Sourced" Script-Review flag in lockstep — both must be
family- AND shape-agnostic and spell out the framework/structural exemptions.

**Deliberately NOT enforced:** bare years ("in 2024") — they're temporal refs
the codebase already skips (TIME_REFERENCE_PATTERN) to avoid false positives,
and the canonical "40% longer than 2024" case already trips via the 40%; and
word-form "percent" — would false-positive on colloquial "100 percent agree".
