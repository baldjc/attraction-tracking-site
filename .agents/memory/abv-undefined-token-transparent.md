---
name: Undefined Tailwind token renders transparent
description: Referencing an abv-* color token not defined in globals.css @theme silently renders transparent (no build error) — a recurring source of bleed-through / invisible surfaces.
---

# Undefined Tailwind/abv color token = silent transparent

Using a utility like `bg-abv-surface` where `--color-abv-surface` is NOT defined
in `globals.css` `@theme` produces **no error** — Tailwind emits the class but the
color resolves to nothing, so the element renders transparent. This shows up as
panel bleed-through, invisible cards, see-through bubbles, etc.

**Why:** the design system only defines a fixed set of `--color-abv-*` tokens.
`abv-surface` was never among them; the real card token is **`abv-card`**
(`--color-abv-card`: #FFFFFF light / #1A2232 dark). `abv-bg`, `abv-card`,
`abv-text`, `abv-text-secondary`, `abv-border`, `abv-border-strong`,
`abv-ai-tools` are the defined ones.

**How to apply:** when a surface looks transparent / bleeds through, grep the
class against the `@theme` block in `globals.css` FIRST — a missing definition is
the cause, not z-index/opacity. For opaque card surfaces use `bg-abv-card`. After
any restyle, verify every new `abv-*` utility maps to a defined token.
