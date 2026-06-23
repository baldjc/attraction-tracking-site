// Per-process in-flight guard for market-data validation dispatch.
//
// Lives in its own dependency-free module so BOTH the recovery scheduler
// (validation-recovery.ts) and the in-process executor (fact-validator.ts) can
// share one Map without creating an import cycle.
//
// LIFECYCLE: a row is marked in-flight the moment it is dispatched, and cleared
// the moment its in-process run settles (validateUploadAsync's finally) — see
// fact-validator. While a row is executing it has status='validating' with
// nextAttemptAt=null, which makes it eligible for the stale-watchdog scan; the
// in-flight marker is what stops the watchdog from re-dispatching a run that is
// still going. Once the run settles the row is either terminal or has a FUTURE
// nextAttemptAt (an auto-retry) — neither is watchdog-eligible — so clearing the
// marker on settle is safe AND lets a due auto-retry fire on the next 60s sweep
// instead of being suppressed until the TTL expires.
//
// The TTL is a backstop only: if a run dies without reaching its finally (e.g.
// the process is killed), the marker self-clears slightly above the stale bound
// so the watchdog can eventually reclaim the row.
const INFLIGHT_TTL_MS = 25 * 60 * 1000;
const inFlight = new Map<string, number>();

export function isInFlight(id: string): boolean {
  const t = inFlight.get(id);
  if (t == null) return false;
  if (Date.now() - t > INFLIGHT_TTL_MS) {
    inFlight.delete(id);
    return false;
  }
  return true;
}

export function markInFlight(id: string): void {
  inFlight.set(id, Date.now());
}

export function clearInFlight(id: string): void {
  inFlight.delete(id);
}
