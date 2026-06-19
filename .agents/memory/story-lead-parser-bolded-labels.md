---
name: Story-lead parser bolded-label brittleness
description: Why a valid market upload yields 0 story leads despite well-formed leads in the raw validator output
---

A valid single-month market upload can persist **0 MarketStoryLead rows** even when
the validator's `rawValidatorOutput` contains a perfect `## STORY LEADS` section with
many well-formed leads. The fact count (hundreds) looks healthy; only leads vanish,
so the new-member dashboard briefing comes back `{ empty: true, reason: "no_story_leads" }`.

**Root cause:** `parseStoryLeads()` in `fact-validator-parser.ts` extracts each lead's
fields (PATTERN / DATA THREADS / WHY IT MATTERS / …) by an ALL-CAPS-label regex.
`splitSections` buckets the leads fine, but the field matcher only matched the labels
the *prompt documents* (plain `PATTERN:`). The model **inconsistently decorates** the
labels with markdown emphasis (`**PATTERN:**`, sometimes `**PATTERN**:`, sometimes with
a leading `- ` bullet). When bolded, every field came back empty and the
"skip empty block" guard dropped **every** lead. This is why the same pipeline gives 6
leads on one upload and 0 on the next — it tracks whether that run happened to bold.

**Why not fix the prompt:** the model won't reliably obey "don't bold." The durable fix
is a parser tolerant of optional emphasis (`** * __ _`) and a leading list marker around
the key, with the colon either inside (`**KEY:**`) or outside (`**KEY**:`) the emphasis —
applied to BOTH the field-match anchor and the next-field lookahead.

**Related latent bug fixed at the same time:** the field-value terminator used `\Z`,
which JS treats as a **literal `Z`**, not end-of-input. With the `m` flag this silently
dropped the LAST field of every block (usually `TACTILE TYPE`). Use `$(?![\s\S])` for a
real end-of-input assertion, plus `---` rule / `###` heading stops.

**How to apply / verify:**
- The parser is the single source for lead parsing; `parseSummaryAndLeadsChunk` (used by
  both the live run and the `reconstructFromRawValidatorOutput` reuse path) flows through it.
- To **backfill** an already-`validated` upload at **$0** (no AI spend): flip its status off
  `"validated"` while KEEPING `rawValidatorOutput`, then call `runValidation(id)`. It takes the
  reuse path (`reuseAiOutput = priorRaw.length > 0`), re-parses with the fixed parser, and
  atomically re-persists facts + leads. (See also the runValidation-reuse-repersist note.)
- Regression coverage lives in `src/lib/fact-validator-parser.test.ts` (plain, bolded,
  colon-outside, and bold==plain equivalence). Run: `npx tsx --test src/lib/fact-validator-parser.test.ts`.
- A 0-leads upload is NOT a sample-size/floor problem — check the raw output for a populated
  `## STORY LEADS` section FIRST; if leads are present there, it's a parse/persist issue.
