---
name: Lean word-floor cross-prompt sync
description: The Script Builder word floor lives in 3 prompt/validator surfaces that must all key off hasProfile together.
---

# Lean grounded mode — word-floor lives in multiple surfaces

For ARC Script Builder market_update generation, the "2,200 dialogue words"
expectation is encoded in THREE independent places, not one:

1. The validator floor (`checkMinDialogueLength` / `validateScript` in
   `script-content-rules.ts`) — gates the draft.
2. The INITIAL output instruction in `buildInitialUserMessage`
   (`scriptBuilder.ts`) — tells the model the target up front.
3. The per-violation RETRY hint in `suggestRetryFix` for `min_dialogue_length`
   (`scriptBuilder.ts`) — tells the model how to fix a short draft, and the
   old text literally said "expand using the FULL neighbourhood profile".

**Rule:** all three must be conditioned on `hasProfile` in lockstep.

**Why:** members with NO KB neighbourhood profile (e.g. Phil Martin) were
hard-failing `validator_max_retries`. Relaxing only the validator floor (1)
was not enough — surfaces (2) and (3) kept telling the model to pad toward
2,200 "using the full neighbourhood profile" that doesn't exist, so it
invented demographic/build-era/income/amenity colour and unsourced number
ranges, which other validator rules (unanchored_stat, no_avatar_pander,
unsourced_factual_claim) then rejected. Those rule violations were SYMPTOMS
of an unsatisfiable word floor with no profile, not independent bugs.

**How to apply:** when touching the word floor or lean mode, grep for the
2,200 literal across `scriptBuilder.ts` + `script-content-rules.ts` and update
every occurrence. `hasProfile` is derived from
`Object.keys(neighbourhoodContext).length > 0` in the prompt builders and from
`opts.hasNeighbourhoodProfile ?? non-empty profileText` in the validator.

**Graceful degrade:** on budget-exhaust / max-retries, buildScript ships the
cleanest attempt DEGRADED (ok:true, degraded, flagged) only if the draft is
non-empty AND anchoredDetailCount > 0; otherwise it still hard-fails. This is
deliberate — a draft that grounds nothing is a real failure, a draft with
residual style violations but real anchored data is shippable-with-flags.

**Save-route floor is FLOOR-ONLY:** the save-script route passes
`hasNeighbourhoodProfile` (computed via case-insensitive name match against the
member's vocab profiles actually named in the script) but deliberately does NOT
pass `profileText`/`sourceOfTruth`/`citedFacts`. Passing those would activate
qualitative/stat grounding gates at save and BLOCK the degraded drafts this
feature is designed to let through. Keep save grounding gates off.
