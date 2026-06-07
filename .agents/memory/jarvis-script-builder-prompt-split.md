---
name: Jarvis Script Builder rules live in a system prompt AND a tool-message builder
description: The Jarvis Script Builder's LM-placement framing and dialogue word-floor are duplicated across the system mode prompt and the headless prompt builder (incl. its retry hint); change all in lockstep or the live generation fights the new rule.
---

# Jarvis Script Builder: rules are split across two prompt sources

The Jarvis ("v2") Script Builder is NOT the same tool as the ARC Script Builder
(`arc-script-builder-prompt.ts`). Its instructions live in TWO places that BOTH
feed the live generation (`/api/ai-tools/script-builder-v2`):

- **System / mode prompt** — `src/lib/script-builder-mode-prompt.ts`
  (`SCRIPT_BUILDER_MODE_PROMPT`): the detailed, authoritative rules + self-check.
- **Headless tool-message builder** — `src/lib/tools/scriptBuilder.ts`: imports the
  mode prompt, then ALSO restates condensed versions of the same rules in the
  user/tool message (lead-magnet placement summary, the `## OUTPUT` block) AND in
  the per-rule **retry hint** for `min_dialogue_length`.

**Rule:** any change to a rule that the mode prompt expresses must be checked
against the condensed restatements in `scriptBuilder.ts`. Two concrete pairs that
drift silently:

1. **Lead-magnet 1/3 framing.** When LM 1/3 changed from a bolted-on "gift block"
   to a natural, avatar-anchored woven aside, the mode prompt was updated but
   `scriptBuilder.ts` still said "as a gift" / "GIFT framing" in the LM summary +
   OUTPUT lines — pushing the model back toward the robotic version.
2. **Dialogue word-floor.** The lean floor (no neighbourhood profile) and full
   floor (2,200) are enforced in `script-content-rules.ts` (`LEAN_DIALOGUE_WORDS`
   / `MIN_DIALOGUE_WORDS`), but `scriptBuilder.ts` ALSO hard-codes the floor
   numbers and steering in the `## OUTPUT` block and the `min_dialogue_length`
   retry hint. When the lean floor was raised 1,200→1,600, the retry hint still
   said "the lean floor is 1,200" and told the model to "cover every fact and
   stop" — which makes the model stop short of the new floor, so the validator
   rejects and the retry loop churns.

**Why:** the condensed restatements are copy-pasted prose, not a shared fragment.
Drift only surfaces at runtime in member-facing scripts or as retry churn.

**How to apply:** when changing a Jarvis Script Builder rule, grep BOTH
`script-builder-mode-prompt.ts` and `tools/scriptBuilder.ts` for the rule text and
the floor numbers, and update the `min_dialogue_length` retry hint to match the
validator's floor. The intent for length is depth, not padding: steer the model to
reach the floor via more grounded analysis (segment, compare, interpret), never by
repeating the thesis or inventing colour.
