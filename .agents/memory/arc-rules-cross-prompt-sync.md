---
name: ARC rules live in two prompts that must stay in sync
description: The ARC method rules are duplicated across the Script Builder and the Script Review prompts; changing one without the other makes the reviewer grade against rules the builder no longer follows.
---

# ARC rules are duplicated across builder + reviewer prompts

The ARC method (lead-magnet placement, close/CTA behaviour, loops, grade-5,
etc.) is hand-written into BOTH:

- **Script Builder** — `src/lib/arc-script-builder-prompt.ts`
  (`ARC_MASTER_SYSTEM_PROMPT` + the 7-section `ARC_SCRIPT_BUILDER_DEFAULT_PROMPT`).
- **Script Review** — `src/lib/audit-engine.ts`
  (`SCRIPT_REVIEW_PROMPT` for analysis + `SCRIPT_REVIEW_CHAT_SYSTEM_PROMPT` for
  the follow-up coaching chat). The member tool that uses these posts to
  `/api/ai-tools/script-review`.

**Rule:** any change to an ARC rule (e.g. lead-magnet now = exactly 3 mentions at
first-talking-point / ~40% / outro-binge-hook, and the close = forward/binge
"Stakes" hook, never a recap or sales pitch, no push-CTA) must be applied to ALL
of these prompts in lockstep — including the reviewer's revised-script TEMPLATE
inside `SCRIPT_REVIEW_PROMPT`, not just its checklist. Otherwise the reviewer
flags scripts the builder just produced, or the reviewer's own rewrite violates
the new rule.

**Why:** there is no shared rule fragment — the text is copy-pasted prose in each
constant. Drift is silent and only shows up at runtime in member-facing output.

**Gotcha — DB override:** `SCRIPT_REVIEW_PROMPT` / `SCRIPT_REVIEW_CHAT_SYSTEM_PROMPT`
are only the code defaults. The route reads an `AppSetting` override
(`script_review_analysis_prompt` / `script_review_chat_prompt`) first and falls
back to the code default. If an admin saved a custom prompt in the DB, editing the
code constant has no effect until that override is cleared/updated in the admin UI.
Same pattern likely applies to other AI-tool prompts.

**How to apply:** when asked to change an ARC rule, grep both files for the rule
text, update every prompt constant + the reviewer template, and consider whether a
live `AppSetting` override is shadowing the code default.
