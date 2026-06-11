---
name: Connection/empathy dosage gate + clustering distribution
description: How the Script Builder empathy-dosage validator works and why clustering measures word-windows + coverage, not writer "---" rules.
---

# Empathy / connection-language dosage gate (Jarvis Script Builder)

A generation-only validator gate in `script-content-rules.ts` enforces the voice
guide's empathy dosage on the script BODY, extending the `stressor_acknowledgement`
pattern. Floors (band minimums): connection phrases >=4, values-peppering >=2,
editorial/signature >=6, aggrieved first-person reactions = 0.

**Gating:** entirely INERT unless `opts.enforceConnectionDosage`. Only the
generation path (`buildScript` in `tools/scriptBuilder.ts`) sets it true; the
save route and Jarvis-save stay inert. It is **degrade-not-hard-block** — drives
the same reprompt loop as other gates and ships flagged on retry exhaustion.

**Lockstep sites:** the floors/bands appear in the deterministic rules,
`script-builder-mode-prompt.ts` (CONNECTION section + self-check), and the
`scriptBuilder.ts` retry-fix hints. Change all in lockstep (same hazard class as
the other cross-prompt-sync notes).

## Clustering must measure word-windows + coverage, not "---" rules

**The rule:** the `connection_clustering` check ("empathy must be DISTRIBUTED, not
dumped in one place") measures over fixed ~250-word window regions
(`chunkByWords` in `dosageScanBody`), and fires only when ALL of: one region holds
>=4 beats, that region holds >50% of all connection+values beats, AND the beats
touch <=2 regions total (`DOSAGE_CLUSTER_MAX_BEAT_REGIONS`).

**Why:** clustering originally split the body on writer-emitted `---` horizontal
rules, falling back to the whole body as ONE section when none existed. The script
writer emits `---` inconsistently — a genuinely well-spread, flowing-prose body
with no rules collapsed into one giant "section" so maxInSection == total and
clustering ALWAYS false-positived (verified live on a 5-neighbourhood script whose
empathy ran top-to-bottom). This is the SECOND time clustering false-positived
(the first fix made it relative `>50%`; that wasn't enough). The coverage
condition is what actually kills it: a body that touches 3+ regions is distributed
by definition, even if one region is naturally denser (e.g. a strategy recap).

**How to apply:** never reintroduce a dependency on writer formatting (`---`,
headings) for distribution measurement — distribution must be spatial
(word-windows). The floors count on `scanBody`; clustering counts on the windows;
both exclude hook/intro-options/citations via `dosageScanBody`. Known tradeoff: a
real cluster straddling a window boundary can be slightly under-penalized — an
acceptable cost vs. the prior guaranteed false-positive on no-rule prose.

**Verify offline (free, no LLM):** import `checkConnectionDosage` + `dosageScanBody`
and run on a saved script body — distributed bodies and real saved scripts must
NOT fire; beats stacked into the top window MUST fire.
