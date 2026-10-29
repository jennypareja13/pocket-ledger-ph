// All money is stored as integer centavos. Never use floats for arithmetic.
export const MAX_CENTAVOS = 100_000_000_000_00; // ₱100 billion ceiling

/** Parse user input like "1,000.50" or "₱15" into centavos. Returns null if invalid. */
export function parseAmount(input: string): number | null {
  const s = String(input ?? "").replace(/[₱,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const c = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(c) || c > MAX_CENTAVOS) return null;
  return c;
}

/** Parse a signed amount ("-250.00"), used only for balance adjustments. */
export function parseSignedAmount(input: string): number | null {
  const s = String(input ?? "").trim();
  const neg = s.startsWith("-");
  const v = parseAmount(neg ? s.slice(1) : s);
  return v === null ? null : neg ? -v : v;
}

export function centsToInput(c: number): string {
  const sign = c < 0 ? "-" : "";
  const a = Math.abs(c);
  return `${sign}${Math.trunc(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

const fmt = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
export function formatPHP(c: number): string {
  return fmt.format(c / 100);
}
export function formatSignedPHP(c: number): string {
  return (c > 0 ? "+" : c < 0 ? "−" : "") + fmt.format(Math.abs(c) / 100);
}
