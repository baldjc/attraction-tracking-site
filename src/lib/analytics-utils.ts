export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fillDays(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999);
  while (cur <= endDay) {
    days.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
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
