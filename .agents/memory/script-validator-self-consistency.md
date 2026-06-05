---
name: Script validator self-consistency & context scoping
description: Two recurring traps when adding deterministic script-content rules — softener output must satisfy the rules, and context-scoped rules must read the whole sentence.
---

# Script validator self-consistency & context scoping

When adding deterministic rules to `src/lib/script-content-rules.ts`, two traps
keep recurring:

1. **Softener output must satisfy the validator's own rules.** The pre-validation
   softener (`autoSoftenUnanchoredStats` → `directionalForDollars` etc.) rewrites
   unanchored stats into directional phrases. Any new "ban this phrase" rule
   (e.g. `placeholder_number` bans "a meaningful amount") can collide with a
   phrase the softener deterministically emits, creating an infinite
   reject→reprompt loop. After adding a banned-phrase rule, grep the softener
   fallbacks for that phrase and change the fallback too.
   **Why:** the softener and the validator are separate code paths with no shared
   vocabulary; a banned phrase in one self-rejects in the other.

2. **Context-scoped rules must read the FULL containing sentence — both sides of
   the anchor token.** A rule that only inspects text *before* its regex match
   (e.g. scoping a credibility cadence on a first-person subject) is bypassable by
   reordering ("Every 53 hours, our team helps…"). Slice left to the previous
   sentence boundary AND right to the next `[.!?\n]`, then test the whole window.
   **Why:** natural language puts the qualifying subject/object on either side of
   the number; prefix-only scoping is a silent under-enforcement bug.

**How to apply:** new rules need both a positive test (violation fires) and a
false-positive test (legit phrasing passes), plus — for banned-phrase rules — a
test that the softener output is clean, and — for context-scoped rules — a
token-first / token-last ordering test.
