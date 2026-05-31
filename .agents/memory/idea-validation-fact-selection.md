---
name: Idea Validation fact selection
description: How Idea Validation picks the limited facts it sends to Claude, and why selection must guard against metric-family starvation.
---

# Idea Validation fact selection

Idea Validation sends only a small capped set of headline-safe facts to Claude
(cap exists to hold a per-call cost budget). The naive approach — order facts by
metric-family enum order and take the first N — silently drops whole families in
wide markets (many neighbourhoods), because early families (MOI/PSF/MEDIAN/DOM)
fill every slot before late-enum families are reached.

**Rule:** when selecting facts under a hard cap, load the candidate set
**neighbourhood-first** (so every family is represented even if the DB `take`
cap bites), then **round-robin across metric families** down to the cap. Both
steps are required; either alone still starves late families.

**Why:** families that sort late in the canonical enum (SP_LP / sale-to-list,
FAILURE_RATE) were vanishing entirely, so Idea Validation wrongly reported "no
sale-to-list ratio data" for bidding-intensity ideas even when the data existed.
Truncation happened in two places — at the DB query ordering AND at the cap — so
fixing only one left the bug.

**How to apply:** any future change to which facts get sent to an LLM under a
size/cost cap (Idea Validation, Content Engine, Script Builder) must preserve
family balance. If you add a new metric family, confirm it can survive the cap;
don't rely on enum position. The shared loader exposes an opt-in
neighbourhood-first ordering for callers that re-balance afterwards; leave the
default family-first ordering for callers that don't.
