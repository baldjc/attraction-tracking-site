// Shared single-family property-CLASS classifier.
//
// The property CLASS column (e.g. "Single Family" / "Condo" / "Townhouse") is
// distinct from the mapped STYLE column (e.g. "2 Storey" / "Bungalow"): a
// "2 Storey" row can belong to either a single-family home OR a condo. Style-
// segmented cuts must only fold single-family rows into their headline, so both
// the deterministic aggregator (csv-aggregate.ts) and the on-demand cut engine
// (computeCut.ts) classify class through this one predicate — keeping them in
// lockstep. Condos remain reachable only via an explicit property-class cut.

/**
 * Substrings that mark a class as NOT single-family. Checked first so
 * "semi-detached" (contains "detached") is correctly excluded.
 */
const NON_SINGLE_FAMILY_MARKERS = [
  "condo",
  "apartment",
  "semi",
  "town",
  "row",
  "duplex",
  "triplex",
  "fourplex",
  "multi",
  "mobile",
  "manufactured",
  "flat",
  "unit",
];

/** Substrings that mark a class as single-family / detached. */
const SINGLE_FAMILY_MARKERS = [
  "single family",
  "single-family",
  "singlefamily",
  "single detached",
  "detached",
];

/**
 * True when a raw property-CLASS cell denotes a single-family / detached home.
 * Conservative: an unrecognized value (e.g. a bare "Residential") returns
 * false, so a restriction that gates on "any single-family row present" simply
 * stays inactive rather than zeroing a member whose class column uses unfamiliar
 * vocabulary.
 */
export function isSingleFamilyClass(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const s = raw.toString().trim().toLowerCase();
  if (!s) return false;
  if (NON_SINGLE_FAMILY_MARKERS.some((m) => s.includes(m))) return false;
  return SINGLE_FAMILY_MARKERS.some((m) => s.includes(m));
}
