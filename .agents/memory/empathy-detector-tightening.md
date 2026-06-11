---
name: Empathy detector tightening (stressor-ack + values)
description: How the stressor_acknowledgement and values_peppering detectors distinguish genuine empathy from data/strategy, and the counting/clustering coupling to keep in lockstep.
---

# Empathy detectors: felt-emotion vs data/strategy

The two generation-only empathy gates in `script-content-rules.ts` accept GENUINE
empathy and must REJECT data observations and strategy/segmentation/advice lines —
even when those lines are spoken with "we" or contain a worry word.

**Rule:**
- `stressor_acknowledgement` (markers + per-sentence reject): a felt marker
  ("you're worried", "the fear of…") only counts when the sentence is genuinely
  emotional. A felt marker inside a TACTICAL line ("the families who win prepare
  early") or a DATA line ("the density pressure you might worry about") is NOT an
  acknowledgement. The bare verb "worry"/"worried about X" is a data-line magnet —
  require the avatar to BE the worried subject (adjective framing), not "worry
  about <thing>". `STRESSOR_ACK_REJECT` filters tactical/advice/segmentation
  sentences even when a marker + anchor co-occur.
- `values_peppering_dosage`: a values beat is a stated BELIEF / philosophy /
  commitment about how clients are treated ("we believe every family deserves…",
  "our whole approach is built around…", "you deserve…"). Market strategy,
  audience segmentation, advice, and data-observations spoken with "we" ("the
  families we work with", "the families who win", "we'd point you toward", "we
  have found") are TACTICS, not values, and must NOT count. The patterns are
  deliberately tight and positive-only (no reject list needed) — adding tactic
  patterns is what made it pass on zero genuine beats.

**Why:** diagnosis on a real 5-hood script found the ONLY accepted stressor-ack
was a data line and ALL 10 values "hits" were strategy/segmentation/advice — both
gates passed on a script with zero genuine empathy.

**How to apply / coupling to keep in lockstep:**
- Values count uses `countSentencesWithPattern` (DISTINCT sentences), not raw
  `countPatternHits` — one belief sentence tripping two patterns is ONE beat.
- The `connection_clustering` per-section math MUST count values the same way
  (sentence-level) or one strong values sentence overstates clustering and
  false-positive re-prompts. Connection stays raw-hit.
- Prompt text lives in THREE places that must move together: `scriptBuilder.ts`
  LOCKED CONTENT RULES item 7 + its `suggestRetryFix` branches, and
  `script-builder-mode-prompt.ts` (stressor block, Values Peppering section,
  self-check items). Detector wording and prompt examples must agree or the
  generator fights the validator and burns retries.
- Both empathy gates + the two secondary guards (`lead_magnet_naming`,
  `hedged_market_state`) are GENERATION-ONLY: inert unless
  `opts.enforceConnectionDosage`. Never broaden them to the save/hand-edit path.

# Secondary deterministic guards
- `lead_magnet_naming`: the configured `leadMagnetName` must appear verbatim
  (alphanumeric-normalised) in the body ≥1×. Catches a renamed magnet (e.g.
  campaign "Moving Up Guide" rendered as "The Edmonton Move Up Guide"). Distinct
  from `lead_magnet_match` (which bans pitching a DIFFERENT artifact type).
- `hedged_market_state`: bans compound hedge labels ("balanced-leaning-sellers",
  "seller's market tilting toward balanced"). The member-threshold labelling
  already resolves ONE clean state; the script must speak that one state.

**Verify-by-reading shortcut:** run `validateScript` (with `activeStressor`,
`enforceConnectionDosage:true`, `leadMagnetConfigured/Name`) on an EXISTING saved
script via `npx tsx` against the shared DB — a too-loose→tightened change should
flip it from pass to fail. This is the non-destructive proof; a live `buildScript`
rebuild makes billable Anthropic calls AND would overwrite the member's real prod
script, so prefer the detector-replay proof.
