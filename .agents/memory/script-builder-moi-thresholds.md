---
name: Script Builder spoken MOI thresholds
description: Why the script builder's sellers/balanced/buyers boundary numbers must come from member config via the user message, not the cached system prompt.
---

# Script Builder spoken MOI market-state thresholds

The market-state labels (sellers / balanced / buyers / balanced-high-end) AND the
boundary numbers the script speaks must come from the MEMBER's configured
`MarketConfig` (`moiThresholds`, `highEndException`, `moiHighEndExceptionFloor`),
not hardcoded 2.5/4.0. The Fact Validator was already dynamic; the script-builder
prose was the laggard (e.g. an Edmonton script said "anything above 3.0 starts to
shift toward buyers").

**Why the fix lives in the USER message, not the rule const:** the locked
MOI_READING_RULES const (`script-data-honesty-rules.ts`) is (a) embedded in the
Anthropic-CACHED `SCRIPT_BUILDER_MODE_PROMPT` whose header forbids concatenating
per-request dynamic content, (b) covered by a verbatim snapshot test, and (c)
re-embedded in the ARC wizard route. So it must stay byte-identical. The dynamic
member thresholds are injected into the per-request user message instead (a
`## YOUR MARKET'S MOI THRESHOLDS` block that tells the model to defer over the
framework's illustrative defaults). The cached prompt's generic 2.5/4.0 stays as
an illustrative default only.

**How to apply:**
- The renderer is `marketStateThresholdsLines()` in `content-engine-context.ts`,
  pushed into the user message in `buildScript()` (`scriptBuilder.ts`) right after
  the `Market:` line. `buildScript` is the SHARED core for BOTH the v2 route and
  the Jarvis tool path, so one injection covers both pipelines.
- **Fallback for null/malformed config must be the PER-MLS seed**
  (`resolveMarketDefaults(mlsSource)` → seed.moiThresholds/highEndException/floor),
  NOT the global `DEFAULT_MOI_THRESHOLDS` (Calgary 2.5/4.0). Otherwise a non-CREB
  member (e.g. NTREIS 4.0/6.0) with unset thresholds hears Calgary numbers — the
  very bug class being fixed. This mirrors the validator's resolution exactly.
- `MarketConfigSummary` must therefore carry `mlsSource` + `highEndException` +
  `moiHighEndExceptionFloor` (added to the loader select+mapping); `moiThresholds`
  was already there. Any new field on the summary breaks the typed fakes in
  `scriptBuilder.test.ts` and `evals/run.ts` — update both.
- Keep CREB byte-identical (2.5/4.0, $1.5M/$800K) so Calgary members see no
  regression; verified via a pure render of the three cases.
