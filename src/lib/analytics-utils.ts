export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Timezone-aware helpers ───────────────────────────────────────────────────
// tzOffset = value of new Date().getTimezoneOffset() on the client
// (positive means west of UTC, e.g. 420 = UTC-7 / PDT)
// Formula: localTime = utcTime - tzOffset * 60000

export function toLocalDateStr(d: Date, tzOffset: number): string {
  return new Date(d.getTime() - tzOffset * 60000).toISOString().slice(0, 10);
}

export function toLocalHourKey(d: Date, tzOffset: number): string {
  return new Date(d.getTime() - tzOffset * 60000).toISOString().slice(0, 13);
}

export function fillLocalDays(start: Date, end: Date, tzOffset: number): string[] {
  // Floor start to beginning of the local day
  const localStart = new Date(start.getTime() - tzOffset * 60000);
  localStart.setUTCHours(0, 0, 0, 0);
  const localEnd = new Date(end.getTime() - tzOffset * 60000);
  const days: string[] = [];
  const cur = new Date(localStart.getTime());
  while (cur <= localEnd) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export function fillDays(start: Date, end: Date): string[] {
  return fillLocalDays(start, end, 0);
}

export interface AnalyticsPeriod {
  periodStart: Date;
  periodEnd: Date;
  prevStart: Date;
  prevEnd: Date;
  days: number;
}

export function parsePeriod(
  period: string,
  from: string | null,
  to: string | null,
): AnalyticsPeriod {
  const now = new Date();
  if (from && to) {
    const periodStart = new Date(from + "T00:00:00.000Z");
    const periodEnd = new Date(to + "T23:59:59.999Z");
    const days = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86400000));
    return { periodStart, periodEnd, prevStart: new Date(periodStart.getTime() - days * 86400000), prevEnd: new Date(periodStart), days };
  }
  if (period === "all") {
    return { periodStart: new Date(0), periodEnd: now, prevStart: new Date(0), prevEnd: now, days: 365 };
  }
  if (period === "1d") {
    const periodStart = new Date(now.getTime() - 86400000);
    return { periodStart, periodEnd: now, prevStart: new Date(now.getTime() - 2 * 86400000), prevEnd: periodStart, days: 1 };
  }
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const periodStart = new Date(now.getTime() - days * 86400000);
  return { periodStart, periodEnd: now, prevStart: new Date(periodStart.getTime() - days * 86400000), prevEnd: new Date(periodStart), days };
}

export function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export function delta(current: number, prev: number): number {
  if (prev === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prev) / prev) * 100);
}

export function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return "";
  const offset = 0x1f1e6 - "A".charCodeAt(0);
  return String.fromCodePoint(code.toUpperCase().charCodeAt(0) + offset, code.toUpperCase().charCodeAt(1) + offset);
}
