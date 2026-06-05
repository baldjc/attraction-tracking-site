# AI Tool Extractability Audit

**Purpose:** assess how readily each AI tool route can be refactored into a
**pure, headlessly-testable core** — the pattern proven by the Script Builder
spike (`src/lib/tools/scriptBuilder.ts` + `buildScript()`). "Extractable" means
the prompt-building, model-call, validation, and retry logic can move into a
plain `async function(params): Promise<Result>` with **no** coupling to:

- Next.js `Request`/`Response` or SSE plumbing
- React / client state
- Prisma (the DB reads/writes stay in the route; the core takes plain data in)
- `process.env` / API-key construction at import time

The model call is injected (a streamer/completer interface) so a unit test can
run the core with a fake LLM and assert on the output, with no network and no
secrets.

---

## The reference: Script Builder v2 (DONE)

`src/app/api/ai-tools/script-builder-v2/route.ts` was the hardest case — a
streaming SSE route with a generate → auto-fix → validate → retry loop and a
wall-clock budget. It is now split:

- **`src/lib/tools/scriptBuilder.ts`** — `buildScript(params)`:
  - Pure functions for prompt assembly (`buildInitialUserMessage`,
    `buildRetryUserMessage`, `suggestRetryFix`), avatar/property-type helpers.
  - A `ScriptLlmStreamer` interface + `createAnthropicStreamer()` default
    (lazily constructs the Anthropic client, so importing the module never
    needs `ANTHROPIC_API_KEY`).
  - The full generate→validate→retry loop with budget guard, returning a
    structured `BuildScriptResult` (`ok`, `script`, `attempt`, `warnings`,
    `violations`, `metrics`, token counts, `aborted`, `error`, `errorExtra`).
  - Callbacks (`onPhase`/`onToken`/`onViolation`) the route maps onto SSE
    frames — the core never knows about SSE.
- **The route** keeps only the HTTP/SSE shell: auth, feature flags, cost cap,
  all Prisma loads, building the plain-data inputs, opening the stream, and
  mapping `BuildScriptResult` back onto `phase`/`token`/`violation`/`complete`/
  `error` frames + billing.
- **`src/lib/tools/scriptBuilder.test.ts`** — `node:test` + `tsx`, injects a
  fake streamer, asserts a non-empty script containing the cited facts, and
  asserts the terminal `validator_max_retries` error on a too-short draft. No
  network, no DB, no key.

**Key lessons (apply to every extraction below):**
1. Lazily construct the model client inside the streamer, never at module load.
2. Return a structured result; let the route own all I/O-frame mapping + billing.
3. Keep Prisma in the route — pass the core plain typed data.
4. Preserve exact call order on terminal paths (e.g. bill-before-`complete`).
5. Inject the clock for any wall-budget logic so budget paths are testable.

---

## Tool-by-tool assessment

Tiering: **A** = same shape as Script Builder, high value, low risk · **B** =
extractable with moderate untangling · **C** = thin/CRUD or already-simple,
low payoff.

### Tier A — strong candidates (streaming/validation cores, high reuse)

| Route | Why it's a fit | Extraction notes |
|---|---|---|
| `arc-script-builder/route.ts` | Streaming script generation that shares ARC content rules with Script Builder (see memory: *ARC rules cross-prompt sync*). | Mirror `buildScript`: pure prompt + injected streamer + validate loop. Highest reuse because the ARC rules already live in shared libs. |
| `script-review/route.ts` | LLM review pass over a script using the same ARC ruleset; deterministic, output-shaped. | Extract `reviewScript(params)` returning structured findings; route streams them. Keeps ARC rules in lockstep with the builder. |
| `idea-validation/route.ts` | Fact-selection + LLM validation with known correctness gotchas (memory: *Idea Validation fact selection*). | Pure `validateIdea(params)` taking pre-loaded facts; makes the round-robin/neighbourhood-first selection unit-testable. |
| `content-engine-v2/route.ts` & `content-engine/chat/route.ts` | Idea generation / chat with structured card output + pin enforcement (memory: *Idea-card theme pin & fact counts*). | Extract the generation core; route keeps persistence + SSE. The card validator is already a pure lib. |

### Tier B — extractable with moderate untangling

| Route | Why | Notes |
|---|---|---|
| `avatar-architect/route.ts` | LLM generation with structured profile output. | Untangle profile-shaping from the request body; inject completer. |
| `title-thumbnail-analyzer/route.ts` | Scored analysis of a title/thumbnail. | Pure `analyzeTitleThumbnail(params)`; route handles upload/loads. |
| `theme-builder/route.ts`, `description-generator/route.ts` | Single-shot generation. | Straightforward `fn(params)` once the prompt is decoupled from the body. |
| `listing-video-builder/route.ts` | Generation with property inputs. | Same pattern; Prisma stays in route. |
| `repurpose-*` (blog/linkedin/facebook/newsletter/postcard/profile) | Family of single-shot transforms over a source script/content. | Best done **once** as a shared `repurpose(kind, params)` core with a per-kind prompt table; routes become thin adapters. High aggregate payoff, low per-route risk. |

### Tier C — low payoff (thin/CRUD/persistence)

`conversations/*`, `saved-scripts/*`, `save-script`, `save-title`,
`content-engine/save-idea|delete-idea|saved-ideas`, `repurposed-content`,
`youtube-videos`, `usage/*`. These are CRUD/listing/persistence routes with
little or no LLM core; extraction yields no testable "core" worth the churn.

---

## Recommended sequencing

1. **`arc-script-builder` + `script-review`** next — they reuse the Script
   Builder pattern and the shared ARC rules, so the marginal cost is low and the
   correctness win (one tested core, rules enforced in lockstep) is high.
2. **`repurpose-*` as a single shared core** — collapses six near-duplicate
   routes into one tested function with a prompt table.
3. **`idea-validation` + content-engine cores** — makes the fact-selection
   correctness gotchas unit-testable.
4. Tier B opportunistically; skip Tier C.

## Risks / gotchas observed

- **Cross-prompt rule duplication** (ARC rules live in builder *and* reviewer):
  extracting both lets the shared rules sit in one place — do them together.
- **Billing/terminal order**: any streaming extraction must preserve
  bill-before-`complete` and emit-error-then-bill ordering (as Script Builder
  now does) or spend reported to the client drifts from `getCostCapStatus`.
- **Prompt-cache markers**: the default streamer must re-apply
  `cache_control: ephemeral` on the static system prompt (done in
  `createAnthropicStreamer`) — losing it silently doubles input-token cost.
