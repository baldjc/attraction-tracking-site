---
name: Avatar-Stressor acknowledgement body scope
description: Why the stressor_acknowledgement validator must exclude intro-option blocks + the opening hook window, and how it degrades.
---

The `stressor_acknowledgement` rule (`checkStressorAcknowledgement` in `src/lib/script-content-rules.ts`) requires a felt-language marker + a stressor anchor stem co-occurring in ONE sentence of the script BODY. The body is the psychology layer — NOT the title, thumbnail, opening ARC hook, or the `### Intro Option N` alternate-opener blocks.

**Why:** The script-builder deliverable emits, in order: title options, thumbnail callouts, 2–3 `### Intro Option N — [angle]` alternates, then the full script (which opens by repeating Intro Option 1's hook). An acknowledgement that only lives in an intro alternate or the ~30s hook must NOT satisfy the gate, or members ship scripts whose body never acknowledges the avatar's stress.

**How to apply (scope-stripping order, all required):**
1. Strip the `## Sources` footnote.
2. Suppress `### Intro Option` blocks PARAGRAPH-bounded (heading through next blank line). Do NOT use a word-budget — a budget bleeds ~N words past the last intro option into the full script and eats early body beats (observed: a 150-word budget swallowed a genuine body acknowledgement). Do NOT suppress heading-to-next-heading either — the full script often has no heading, so that eats the whole body.
3. Drop bracketed production tags and bold-only packaging lines.
4. Skip the opening hook word-window: `skip = min(150, max(40, floor(0.12*words)))`. Floor guarantees the immediate opening is always skipped; cap prevents over-skipping a long body's real beats.

**Degrade, never hard-block:** the rule is severity `error` but INERT when `activeStressor` is null. It is wired ONLY at the generation `validateScript()` call (`scriptBuilder.ts`); the save path does NOT pass `activeStressor`, and the generation loop ships the cleanest attempt FLAGGED on retry exhaustion (graceful degrade). So tightening the body scope only ever costs an extra reprompt — it can never strand a save.

**Residual (accepted):** paragraph-bounded suppression can leak a multi-paragraph intro option's 2nd+ paragraphs into the scan. Intro options are single-paragraph ARC hooks in practice; tightening this risks the catastrophic eat-the-body case, so it's left as-is.
