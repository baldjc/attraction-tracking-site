---
name: Footnote/heading cutoff regexes & validator dialogue scope
description: Why heading-based "stop scanning here" cutoffs in the script validator must be full-line anchored, or grounding checks silently stop running.
---

# Footnote/heading cutoff regexes must be full-line anchored

`stripToDialogue()` in `script-content-rules.ts` collects spoken dialogue and
hard-`break`s at the first line matching the Sources-footnote heading regex.
Everything after that point is excluded from EVERY dialogue rule — including the
grounding/refusal checks (`unanchored_stat`, `no_misattributed_stats`, etc.).

**Rule:** any heading regex used as a "stop collecting dialogue" cutoff must be
anchored to the WHOLE line (`^…$`, allow only optional trailing colon / closing
`**`). A prefix-only match like `/^##\s*sources\b/` also matches content headings
such as `## Sources of demand`, which would truncate dialogue collection
mid-script and let real spoken lines escape all grounding checks.

**Why:** a prefix-anchored cutoff is an accidental (or adversarial) grounding
bypass — exactly the "do not weaken grounding/refusal" constraint. Found in code
review of the ARC Sources-footnote change.

**How to apply:** when adding/altering any cutoff heading (Sources, or a future
audit-metadata section), anchor it end-of-line and add two tests: (a) the exact
heading excludes the trailing block, (b) a same-prefix content heading does NOT
terminate collection. Mirror the pattern used for `SOURCES_FOOTNOTE_HEADING_RE`.

Related: the `no_avatar_pander` "for a second" filler check uses a boundary
lookahead `(?=\s*(?:[.,!?;:]|$))` so it catches the adverbial filler tail but not
the literal "a second <noun>" sense ("second home/opinion/time"). Pander/filler
phrase bans need a boundary guard or they false-positive on ordinary dialogue.
