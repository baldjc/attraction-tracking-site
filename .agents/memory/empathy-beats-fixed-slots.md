---
name: Empathy beats = fixed injected slots
description: Stressor + Values empathy beats are positional slots injected from contentThemes (like the lead magnet), spread across three prompt surfaces that must move in lockstep.
---

# Empathy beats are FIXED POSITIONAL SLOTS with injected content

The Script Builder's avatar-stressor and team-values empathy beats are emitted **by construction** as positional production tags — mirroring the `[LEAD MAGNET n/3]` mechanism — NOT as dosage targets the model is asked to "hit":

- `[STRESSOR BEAT]` — exactly ONE, in the psychology layer, right after the first real data point.
- `[VALUES BEAT 1/2]` + `[VALUES BEAT 2/2]` — exactly two, distributed across the body.

The actual *content* is injected, not invented: `getActiveThemeStress()` (content-engine-prompts.ts) returns `{ name, coreStress, fearLines }`, and scriptBuilder.ts injects the quoted `coreStress` + up to 4 `fearLines` so the beat names the avatar's OWN worry (felt language) instead of a data/strategy line.

**Why:** a dosage-only instruction let the model satisfy the detector with a generic/data line — Defect 3 was "stressor beat renders a data line not the avatar's fear." Making it a positional slot fed with the avatar's real fear questions makes the felt acknowledgement load-bearing every build; the `script-content-rules.ts` detectors (`stressor_acknowledgement`, `values_peppering_dosage`) stay as the backstop, intentionally separate from the injection path — do not fold them together.

**How to apply (LOCKSTEP across THREE prompt surfaces — change all or the model fights itself, e.g. emits zero or two `[STRESSOR BEAT]` tags):**
1. `scriptBuilder.ts` — the injected `## Active Avatar Stressor — REQUIRED FIXED BEAT` and `## Team Values Beats — TWO REQUIRED FIXED BEATS` blocks, plus LOCKED CONTENT RULE 7 and the `## OUTPUT` block reference. `activeStressor` type must carry `fearLines`.
2. `script-builder-mode-prompt.ts` — stressor-acknowledgement paragraph, the permitted-tag list, BODY STRUCTURE → "FIXED EMPATHY BEATS" subsection, "Values Peppering" header, and self-check items 21/22.
3. `content-engine-prompts.ts` — `getActiveThemeStress` / `extractThemeFearLines`.

**fearLines extraction gotcha:** `extractThemeFearLines` matches only **straight-quoted bullets ending in `?`** (`^\s*[-*]\s*"(.+?\?)"\s*$`) from the theme's `content_engine_prompt` "Specific stresses" — the `?` anchor cleanly excludes quoted Title-example *statements*. Curly quotes or non-quoted bullets yield an empty `fearLines` array; this is **non-fatal** because `coreStress` is always injected and is what makes the slot required. (Verified live: Chris Proctor's two themes "The Decision" / "The Neighbourhood" each yield coreStress + 4 fearLines.)

Related: `script-stressor-ack-body-scope.md` (the detector-side body-scope rules) and `avatar-stressor-vs-theme-vocab.md` (member-facing naming: 8 questions = "Avatar Stressor", 5-slot rotation = "Theme").
