import type { Space } from "./types";
import type { Snapshot } from "./store";
import { centsToInput } from "./money";
import { personForTx } from "./labels";
import { isValidDate } from "./dates";

export function csvCell(value: string, kind: "text" | "numeric" | "date" = "text"): string {
  const safe = kind === "text" && /^[\t\r ]*[=+\-@]/.test(value) ? "'" + value : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function transactionsCsv(snap: Snapshot, spaceId: string, from: string, to: string) {
  if (!isValidDate(from) || !isValidDate(to) || from > to) throw new Error("Choose valid dates with From on or before To.");
  const rows = [["date", "space", "type", "amount_php", "fee_php", "category", "source_account", "destination_account", "person", "note", "sync", "reimbursable_php", "personal_expense_php"]];
  for (const t of snap.transactions.filter((t) => !t.deleted && t.space_id === spaceId && t.data.date >= from && t.data.date <= to)) {
    const d = t.data;
    rows.push([d.date.split("-").reverse().join("/"), snap.spaces.find((s) => s.id === spaceId)?.data.name ?? "", d.type, centsToInput(d.amount), centsToInput(d.fee ?? 0), snap.categories.find((c) => c.id === d.category_id && c.space_id === spaceId)?.data.name ?? "", snap.accounts.find((a) => a.id === d.account_id && a.space_id === spaceId)?.data.name ?? "", snap.accounts.find((a) => a.id === d.to_account_id && a.space_id === spaceId)?.data.name ?? "", personForTx(t, snap), d.note ?? "", t._meta.sync, centsToInput(d.reimbursable ?? 0), centsToInput(d.entries.filter((e) => e.report === "expense").reduce((s, e) => s + Math.abs(e.delta), 0))]);
  }
  const numeric = new Set([3, 4, 11, 12]);
  return rows.map((r, index) => r.map((v, column) => csvCell(v, index === 0 ? "text" : column === 0 ? "date" : numeric.has(column) ? "numeric" : "text")).join(",")).join("\r\n");
}
export function downloadFile(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvFilename(name: string, from: string, to: string) {
  return `${name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "space"}-${from}-${to}.csv`;
}
export function exportSpaceCsv(snap: Snapshot, space: Space, from: string, to: string) {
  return { filename: csvFilename(space.data.name, from, to), body: transactionsCsv(snap, space.id, from, to) };
}
