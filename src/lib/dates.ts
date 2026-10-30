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
const dFmt = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const mFmt = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
export function formatDate(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? dFmt.format(new Date(d + "T00:00:00Z")) : d;
}
export function formatMonth(key: string): string {
  return mFmt.format(new Date(key + "-01T00:00:00Z"));
}
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIMEZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}
export function isValidDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z"));
}
