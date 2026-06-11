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

# stressor_beat_voice — coach-speak ban (distinct from stressor_acknowledgement)

The stressor beat is policed by TWO generation-only gates that pull opposite ways:
`stressor_acknowledgement` REQUIRES the body to name the worry; `stressor_beat_voice`
REJECTS naming it in therapist/life-coach voice. Banned in the beat: "you wouldn't
be human", "here's the part that…", "sits heaviest", "keeps you up", "nobody tells
you", "you'd be crazy not to", permission-to-feel ("it's okay to feel", "that
hesitation is normal", "fair to sit with", "weigh on you", "a lot to carry/sit
with", "I want to name that"), and invented timeline scenes ("months after you
close"). Approved felt voice stays: "the fear of…", "what you're really weighing",
"what you keep coming back to", "what you're actually afraid of".

**Why:** the beat plumbing (fires, voices the SELECTED stressor, empathy-only) was
already correct — only the WORDING read like a life coach. Fix is voice-only; do
NOT touch resolution/firing/scope-lock/marker-stripping.

**How to apply / lockstep:**
- The two gates must not fight: any cliché that `stressor_beat_voice` BANS must NOT
  be an ACCEPT marker in `STRESSOR_ACK_MARKERS`, or a coach-speak ack satisfies the
  ack gate while the voice gate rejects it → reprompt loop.
- `checkStressorBeatVoice` MUST scan `dosageScanBody(script).scanBody`, not the full
  script — same body-scoping as the ack gate — or a banned phrase in the hook /
  intro options / citations / production tags false-positives a clean beat.
- The banned list is duplicated across the validator regex (`STRESSOR_BEAT_VOICE_BANNED`)
  AND THREE prompt surfaces: `scriptBuilder.ts` FIXED BEAT hint + its
  `suggestRetryFix("stressor_beat_voice")` retry hint, and `script-builder-mode-prompt.ts`
  (the stressor-ack VOICE paragraph + the FIXED EMPATHY BEATS line). Move all in lockstep.
- Gate is ERROR severity but DEGRADES (ships flagged), never hard-blocks — same
  retry/degrade loop as the other generation gates.
- An OFF-PROFILE stressor (e.g. "The Decision" on a neighbourhood video) produces
  messy DATA output (many unanchored-stat softens, unsourced claims) and may degrade
  on those — that is NOT a voice-fix regression; judge the voice fix on the member's
  CONFIGURED stressor build.

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
