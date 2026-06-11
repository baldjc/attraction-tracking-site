---
name: Empathy beats as fixed positional slots
description: How the stressor + values empathy beats are made to appear by-construction (injected positional tags), mirroring the lead-magnet mechanism, and why the bracket-tag approach is detector-safe.
---

The avatar-stressor and team-values empathy beats are emitted as FIXED POSITIONAL SLOTS with injected content, mirroring the `[LEAD MAGNET n/3]` mechanism — they appear **by construction** every build, not via dosage hope.

**Mechanism (three files, must stay in lockstep):**
- `content-engine-prompts.ts` — `getActiveThemeStress()` returns `{ name, coreStress, fearLines[] }`; `extractThemeFearLines()` pulls quoted bullets ending in `?` from the `content_engine_prompt` "Specific stresses" section (cap 4, dedupe). The `?` anchor is load-bearing: it excludes title-example bullets (statements), keeping only fears.
- `scriptBuilder.ts` — `## Active Avatar Stressor` block injects coreStress+fearLines and defines the required `[STRESSOR BEAT]` slot; new `## Team Values Beats` block defines `[VALUES BEAT 1/2]` + `[VALUES BEAT 2/2]` with a canonical belief scaffold (members have NO stored team-values field, only freeform gated voiceGuide). LOCKED CONTENT RULES item 7 + OUTPUT block reference the slots.
- `script-builder-mode-prompt.ts` — stressor para points to `[STRESSOR BEAT]`; BODY STRUCTURE has a FIXED EMPATHY BEATS subsection; Values Peppering header references the tags; self-check items 21/22; **the permitted-labels list ("What you DO label") MUST include the new tags** — there is an earlier "These are the ONLY permitted labels. No others." rule that will otherwise contradict and suppress the new tags.

**Why bracket tags are safe:** `script-content-rules.ts` strips ALL `[...]` generically (`body.replace(/\[[^\]]*\]/g," ")`) before any detector scans AND before the member-facing read. So the new tags never reach members and never trip the empathy detectors — the detectors read the dialogue AFTER the tags. The detectors (`stressor_acknowledgement`, `values_peppering_dosage` ≥2) stay UNCHANGED as the semantic backstop; the tags themselves are production cues only (not presence-checked server-side, exactly like `[LEAD MAGNET n/3]`).

**Scope boundary for this line of work:** generation/template + content injection ONLY. Do NOT add server-side tag-presence checks or touch the detectors — the by-construction injection + existing semantic detectors is the intended design.
