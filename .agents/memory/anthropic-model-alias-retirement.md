---
name: Anthropic model alias retirement breaks AI suite
description: Why a single retired Claude model string can 500 the whole /api/ai-tools/* suite, and the swallowed-error trap that hides it.
---

# Anthropic model-name retirement is a platform-wide P0 with no single source of truth

The Claude model id is hardcoded as a bare string in ~30 separate files (route handlers in `src/app/api/**` and helpers in `src/lib/**`) — there is **no shared model constant**. When Anthropic retires a dated alias (observed: `claude-sonnet-4-20250514` started returning `404 not_found_error`), every call site using it throws and the feature dies. Jarvis/script-builder survived only because its path was already on a newer alias (`claude-sonnet-4-6`).

**Why it looked member-specific / mysterious:** the non-streaming repurpose + description routes call `client.messages.create` with **no try/catch around the SDK call**, so the throw became an uncaught exception → Next.js returns an **empty-body HTTP 500**. Validation errors (400) still worked, so the break was clearly *after* validation in the generation step.

**How to diagnose fast:** reproduce the exact `client.messages.create({ model })` call in a throwaway node script against the live Anthropic key — a retired model returns a 404 with the model name in the message. Probe candidate aliases the same way to pick a valid replacement.

**How to apply:**
- Treat "every `/api/ai-tools/*` generation 500s with empty body but script-builder/Jarvis works" as a model-alias mismatch first, not an LLM-layer outage.
- Fix at the source: replace the dead alias across ALL occurrences (`rg -l "<dead>" src/ | xargs sed`), don't patch one route.
- These non-streaming routes should never emit a bodyless 500 — wrap the SDK call in try/catch and return `{ error, detail }` so the next break is visible.
- **Latent risk:** the model id is still duplicated everywhere. A single shared constant would make the next retirement a one-line fix; until then, expect this class of outage to recur.
