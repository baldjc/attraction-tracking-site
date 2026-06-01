---
name: Dark-mode token remapping
description: Which design tokens remap under html.dark and which do NOT — the trap behind dark-on-dark Button/outline bugs.
---

# Dark-mode token remapping (globals.css)

Dark mode is class-based (`html.dark`, toggled from `localStorage 'atbv-theme'`).
In the `html.dark` block, **some** CSS vars get new values and **some legacy
Tailwind hex utilities are force-remapped** (e.g. `html.dark .bg-white {
background: var(--abv-card) !important }`, `.text-gray-900`, `.text-[#1A1A1A]`,
etc).

**The trap:** `--abv-text` flips light→dark (`#1A1A1A` → `#E2E8F0`), but
`--abv-ink` is **NOT** overridden in dark — it stays `#1A1A1A`. So any utility
written as `text-[var(--abv-ink)]` / `border-[var(--abv-ink)]` over a surface
that *does* remap (like `bg-white`→dark card) renders **dark-on-dark**.

**Rule:** for text/border that must stay readable in BOTH themes, use
`--abv-text` (auto-flips), not `--abv-ink`. Reserve `--abv-ink` for fills whose
contrasting foreground is hardcoded (e.g. primary button = `bg-[--abv-ink]
text-white`, which is fine because the ink stays dark and text is literally
white).

**Why:** the shared `Button` `outline` variant originally used `--abv-ink` for
text+border → invisible in dark mode site-wide (8+ call sites). Fix was to swap
to `--abv-text`: pixel-identical in light (both `#1A1A1A`), readable in dark.

**How to apply:** when picking arbitrary-value color utilities, prefer
`--abv-text`/`--abv-text-secondary` (theme-aware) or explicit `dark:` variants;
treat `--abv-ink` as a light-anchored fill color, not a theme-aware foreground.
