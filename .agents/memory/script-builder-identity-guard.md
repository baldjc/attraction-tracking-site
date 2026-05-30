---
name: Script Builder presenter-identity guard
description: Why the Script Builder leaked the founder's identity to other members, and the rule that prevents it.
---

# Presenter-identity guard (no cross-member leak)

The Script Builder's system prompt (`script-builder-mode-prompt.ts`) is
saturated with the founder's name and voice as the *house style exemplar*
(dozens of "Jared"/"Jared's voice" references). That is intentional brand DNA —
but it means a generated script can spontaneously emit the founder's name or, in
the old code, his hardcoded credentials, as if they were the *current* member's
identity. The on-camera identity must come ONLY from a `## PRESENTER IDENTITY`
block injected into the user message (resolved member's `user.fullName` +
their own `MarketConfig.team*` credibility), never from the prompt's style text.

**Rule:** the validator rule `no_other_member_identity` (in
`script-content-rules.ts`) is the safety net. It must be fed
`currentMemberName` + `forbiddenIdentities` (all OTHER members' multi-token full
names) at **every** `validateScript()` caller — both the streaming generation
route AND the `save-script` persist route. Those options are optional on the
signature, so any caller that omits them **silently disables the guard** and a
direct POST can persist a leaking script. It blocks full names and distinctive
single tokens (>=5 alphabetic chars) drawn from forbidden names, skipping tokens
that belong to the current presenter's own name.

**Why:** a missed identity leak ships another person's name/credentials to a
paying member — a beta blocker. A false positive only costs a regenerate, so the
guard is intentionally conservative.

**How to apply:** when adding a new endpoint that calls `validateScript()`, you
MUST resolve the member (impersonation-safe via `resolveUserFromSession`) and
pass identity inputs, or the guard is inert there. Don't try to scrub the
founder's name out of the prompt — it's the style reference; gate the output.
