// Member-facing neighbourhood hygiene — shared helpers for the persistent
// per-member "excluded neighbourhoods" list (ExcludedNeighbourhood model).
//
// Why this exists: a member's CSV exports sometimes carry junk neighbourhood
// values — raw MLS area codes (100001), "Unknown", misspellings. The member can
// delete those from the Knowledge Base, but a fresh re-upload of the same messy
// export would otherwise resurrect them. The exclusion list is the durable
// record of "names this member never wants to see". Every INGEST write
// (MarketFact, AggregatedMetric, vocab auto-populate) and every neighbourhood
// READ surface (cut engine, availability) filters against this set, so the junk
// stays gone across uploads until the member explicitly un-excludes it.
//
// Matching is case/space-insensitive via `normalizeNeighbourhoodKey`. Strictly
// member-scoped: callers always pass a userId; we never touch another member.

import prisma from "@/lib/prisma";

/**
 * Canonical match key for a neighbourhood name. Trim + collapse internal
 * whitespace + lowercase. Used as `ExcludedNeighbourhood.normName` and for all
 * ingest/read comparisons so "South  Terwillegar", "south terwillegar" and
 * "South Terwillegar " are treated as the same name.
 */
export function normalizeNeighbourhoodKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Fetch the member's exclusion set as normalized keys. Returns an empty Set when
 * the member has excluded nothing (the common case) so callers can branch fast.
 */
export async function getExcludedNeighbourhoodKeys(
  userId: string,
): Promise<Set<string>> {
  const rows = await prisma.excludedNeighbourhood.findMany({
    where: { userId },
    select: { normName: true },
  });
  return new Set(rows.map((r) => r.normName));
}

/**
 * Full exclusion rows (display name + key) for the management UI.
 */
export async function getExcludedNeighbourhoods(userId: string): Promise<
  Array<{ name: string; normName: string; createdAt: Date }>
> {
  return prisma.excludedNeighbourhood.findMany({
    where: { userId },
    select: { name: true, normName: true, createdAt: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Aggregate "rollup" labels the validator emits as pseudo-neighbourhoods. These
 * are NOT real neighbourhoods — they're the citywide/overall rows that downstream
 * scripts and source-of-truth blocks depend on. The member must never be allowed
 * to exclude or delete them (it would silently break aggregate cuts), so the
 * delete/exclude endpoints refuse these keys.
 */
const PROTECTED_ROLLUP_KEYS = new Set<string>([
  "all neighbourhoods",
  "all other neighbourhoods",
  "all areas",
  "overall",
]);

/** True when `name` is a protected aggregate rollup label (never deletable). */
export function isProtectedRollup(name: string | null | undefined): boolean {
  if (!name) return false;
  return PROTECTED_ROLLUP_KEYS.has(normalizeNeighbourhoodKey(name));
}

/** True when `name` is in the (already-fetched) exclusion key set. */
export function isExcluded(set: Set<string>, name: string | null | undefined): boolean {
  if (!name) return false;
  return set.has(normalizeNeighbourhoodKey(name));
}

/**
 * Filter a list of neighbourhood display names, dropping any that are excluded.
 * Convenience for the many ingest/read sites that hold an array of names.
 */
export function filterExcludedNames(
  set: Set<string>,
  names: readonly string[],
): string[] {
  if (set.size === 0) return [...names];
  return names.filter((n) => !set.has(normalizeNeighbourhoodKey(n)));
}

/**
 * Add a name to the member's exclusion list (idempotent on the normalized key).
 * Returns the normalized key that was excluded.
 */
export async function addExcludedNeighbourhood(
  userId: string,
  name: string,
): Promise<string> {
  const normName = normalizeNeighbourhoodKey(name);
  if (!normName) return normName;
  await prisma.excludedNeighbourhood.upsert({
    where: { userId_normName: { userId, normName } },
    create: { userId, name: name.trim(), normName },
    update: {},
  });
  return normName;
}

/** Remove a name from the exclusion list (un-exclude). No-op if absent. */
export async function removeExcludedNeighbourhood(
  userId: string,
  name: string,
): Promise<void> {
  const normName = normalizeNeighbourhoodKey(name);
  if (!normName) return;
  await prisma.excludedNeighbourhood.deleteMany({
    where: { userId, normName },
  });
}
