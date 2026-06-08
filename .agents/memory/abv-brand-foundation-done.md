---
name: ABV canonical brand foundation already installed
description: The Attraction by Video design system is migrated app-wide; what counts as off-brand vs. intentionally-preserved.
---

The canonical Attraction by Video design system is **already installed app-wide** (done by a prior "brand sprint"). The foundation lives in `src/app/globals.css` (`:root` tokens + Tailwind v4 `@theme inline` — there is **no** `tailwind.config.*`, config is CSS-based). Canonical = azure `#3DC3FF` accent, ink `#1A1A1A` primary/sidebar, bg `#FAFAF8`; fonts Cabinet Grotesk (display) + Satoshi (body) via Fontshare, Geist Mono via `next/font/google`. Sidebar uses `bg-[var(--abv-dark)]`; `ui/Button.tsx` is primary=ink / accent=azure pill with azure focus ring.

**Why this matters:** A spec may *read* as if the app is still off-brand (old primary `#6ba3c7`, old sidebar `#1e2a38`). It isn't. Do NOT undertake a giant per-component rewrite into prototype class names (`.shell-side`, `.btn-ink`, etc.) — the app achieves the same result via Tailwind utilities bound to brand tokens, and that rewrite risks breaking functionality.

**How to apply / what is intentional vs. residue:**
- `--abv-ai-tools:#6BA3C7` in `:root` is the **intentionally preserved** "ai" feature tint (one of five: academy/ai/hire/leads/scores). It is NOT off-brand residue — do not strip or "fix" it.
- Genuine off-brand residue, if any, hides in widget-scoped hardcodes (the AI-thinking widget previously hardcoded `#6ba3c7`/`#1e2a38` — now pointed at `var(--abv-azure)` / `var(--abv-ink)`).
- To audit: `rg -in "6ba3c7|1e2a38" src/` should return only `--abv-ai-tools:#6BA3C7`. Mockups/docs (`public/__mockups`, `artifacts/mockup-sandbox`, `docs/`) are NOT the live app — ignore their color refs.
- Per-page layout redesign is explicitly "Phase 2" — out of scope for foundation work.
