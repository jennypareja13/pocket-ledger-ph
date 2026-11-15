import { TIMEZONE } from "./config";

/** Today's date (YYYY-MM-DD) in Asia/Manila. */
export function todayManila(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(now);
}
export function monthKey(date: string): string {
  return date.slice(0, 7);
}
export function currentMonth(): string {
  return monthKey(todayManila());
}
export function addMonths(key: string, n: number): string {
  const [y = 0, m = 1] = key.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
const dFmt = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const mFmt = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
export function formatDate(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? dFmt.format(new Date(d + "T00:00:00Z")) : d;
}
export function formatMonth(key: string): string {
  return mFmt.format(new Date(key + "-01T00:00:00Z"));
}
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
export function isValidDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const date = new Date(d + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === d;
}

export type DatePeriod = "day" | "week" | "month" | "year";

function calendarDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Inclusive calendar date range in Asia/Manila. Weeks start on Monday. */
export function periodDateRange(period: DatePeriod, anchor: string): { from: string; to: string } {
  if (!isValidDate(anchor)) throw new Error("Choose a valid date.");

  const [year = 0, month = 1, day = 1] = anchor.split("-").map(Number);
  if (period === "day") return { from: anchor, to: anchor };
  if (period === "month") {
    return {
      from: dateKey(calendarDate(year, month, 1)),
      to: dateKey(calendarDate(year, month + 1, 0)),
    };
  }
  if (period === "year") {
    return {
      from: dateKey(calendarDate(year, 1, 1)),
      to: dateKey(calendarDate(year, 12, 31)),
    };
  }

  const start = calendarDate(year, month, day);
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { from: dateKey(start), to: dateKey(end) };
}


/** Move an anchor into the adjacent period without browser-time-zone arithmetic. */
export function shiftPeriodAnchor(period: DatePeriod, anchor: string, amount: number): string {
  if (!isValidDate(anchor)) throw new Error("Choose a valid date.");
  if (!Number.isInteger(amount)) throw new Error("Choose a whole number of periods.");

  const [year = 0, month = 1, day = 1] = anchor.split("-").map(Number);
  if (period === "day" || period === "week") {
    const next = calendarDate(year, month, day);
    next.setUTCDate(next.getUTCDate() + amount * (period === "week" ? 7 : 1));
    return dateKey(next);
  }
  if (period === "month") return dateKey(calendarDate(year, month + amount, 1));
  return dateKey(calendarDate(year + amount, 1, 1));
}

/** Human-readable label for the selected calendar period. */
export function formatPeriodLabel(period: DatePeriod, anchor: string): string {
  const range = periodDateRange(period, anchor);
  if (period === "day") return formatDate(anchor);
  if (period === "week") return `${formatDate(range.from)} – ${formatDate(range.to)}`;
  if (period === "month") return formatMonth(anchor.slice(0, 7));
  return anchor.slice(0, 4);
}
