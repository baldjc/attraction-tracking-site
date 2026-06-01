---
name: Metric-variant default-unchanged invariant
description: Why adding deterministic metric variants can silently break "untouched member sees no change", and where the guard must live.
---

# Adding metric variants must not drift the default member's resolved value

When you add new variant rows to a metric family (e.g. FAILURE_RATE gaining
`failureRateExpiredOnly` / `failureRateExpiredPlusWithdrawn` alongside the
canonical `failureRate`), there are TWO resolution paths in the script data
resolver and they have OPPOSITE safety profiles for a default/untouched member:

- **MarketFact path** (AI-validator output): safe by construction for default
  members, because a default member's validator prompt is byte-identical, so it
  only ever emits the canonical variant's facts. Legacy exclusion filters help too.
- **AggregatedMetric path** (deterministic, computed from CSV for EVERY upload):
  NOT safe. The deterministic aggregator persists ALL variant keys for every
  upload regardless of member settings. If the resolver only narrows to the
  canonical key when a `member_metric_settings` row exists, a default member who
  falls through to the aggregate path can drift to a newer/larger coexisting
  variant via the most-recent-month / largest-sample tiebreak.

**Rule:** narrow the family to its canonical variant key for EVERY member,
including the one with no settings row — not just when a settings row exists.
`canonicalVariantKeys(mlsSource, null)` already returns the canonical default
(for failure rate: `failureRate` / `failure_rate`), so apply the preference
whenever the resolved key is non-null. A null key (member explicitly disabled
the metric) is the only case that legitimately skips narrowing.

**Why:** the guard `memberSettings && v.<family>MetricKey` looks reasonable but
silently assumes "no narrowing == today's behavior", which only holds for the
AI path, not the deterministic aggregate path.

**How to apply:** any time a deterministic aggregator starts persisting more
than one key per metric family, audit the resolver's preference branch for that
family and make sure the default member is narrowed to the canonical key. Add a
resolver regression test: default member + coexisting variant aggregates (newer
month / bigger sample on the non-canonical one) must still resolve the canonical.
