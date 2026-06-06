---
name: Script grounding time-ref split (macro/cycle durations)
description: How the ARC grounding validator treats month/day durations differently across grounding vs canonical-value rules, and why macro detection is construction-based.
---

# Time-reference handling in script-content-rules.ts

The validator extracts month/day "stat tokens" and historically **silently dropped**
any duration that wasn't a real market-time metric (months-of-inventory, days-on-market),
because narrative spans like "over the next 90 days" / "18 months to show up in the trend"
aren't market numbers. That drop was duplicated inline at 4 call sites.

## The rule / invariant
A duration pinned to a **macro/cycle milestone** ("18 months past the rate peak",
"12 months into normalization", "6-12 months away from price discovery") is NOT a free
narrative span — it's an unsourceable claim about where the market sits in the cycle and
must be held to the same bar as a current-market number.

Two distinct skip helpers, used by two distinct rule classes:
- **Grounding rules** (unanchored_stat / unlisted_market_stat / autoSoften) use the
  *narrow* skip: drop genuine spans BUT let macro/cycle durations fall through so they
  must trace to a fact or be reframed qualitative.
- **Canonical-value rule** (no_sot_disagreement) uses the *broad* skip: drop ALL
  non-market durations, INCLUDING macro ones.

**Why:** no_sot_disagreement compares a token against a same-unit SoT row. If a macro
"12 months past the rate peak" flowed in, it would be force-compared against
months-of-inventory and raise a bogus canonical-value conflict. Macro grounding belongs
to unanchored_stat, not to the canonical-value comparison.

## How to apply
- Keep the two skip helpers separate; don't collapse them. Grounding paths exempt macro;
  the canonical-value path does not.
- Macro detection must be **construction-based**: require BOTH a relational connector
  (past/since/after/into/away from/from/ago/…) AND a specific cycle anchor (rate peak,
  normalization, price discovery, the correction/recovery, …) in the local window.
  Bare topic words alone (correction / recovery / year-over-year) over-block real
  narrative spans ("in a correction, over the next 90 days …" must still pass).
- Keep the correction/recovery anchor pinned to the **"the"** article; allowing "a"
  re-introduces the "in a correction" false positive.
- Only current-month grounding is in scope; historical %/$ were already caught by the
  family-agnostic unanchored_stat path — the gap was specifically macro/timeline months.
