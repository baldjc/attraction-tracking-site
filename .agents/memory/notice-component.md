---
name: Shared Notice component
description: One brand notice/banner component + severity token system; what is in vs out of its scope.
---

# Shared Notice component

`src/components/ui/Notice.tsx` is the single brand-aligned notice/banner. Variants
`info | warning | error | success` drive a soft-tint background + on-tint text via
CSS tokens (`--abv-notice-*` in `globals.css`, with `html.dark` lightening
warning/error/success text). `info` reuses the base text tokens so it flips for free.
CTAs use the shared `NOTICE_PILL_CLASS` (ink pill).

**Rule:** route any rounded `bg-amber-*`/`bg-yellow-*` heading+body **alert/banner**
strip through `<Notice>` and pick its REAL severity (most "needs setup" nudges are
`info`, not amber). Keep copy/conditional-logic/dismiss/CTA behaviour unchanged —
styling + severity only.

**Why:** the loud amber/yellow boxes clashed with the brand and mis-signalled
severity (informational nudges looked like warnings).

**Scope boundary (intentional, do NOT "fix"):** status **pills/badges/tags**, audit
**score-color** helpers, charts, and standalone icons are a SEPARATE colour system —
they are not banners and must not be converted to `Notice`. Admin-internal pages were
also left out of the first pass; member-facing notice boxes were the target.
