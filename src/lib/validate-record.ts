import { isValidDate } from "./dates";
import { MAX_CENTAVOS } from "./money";
import type { LocalRecord } from "./types";

export type RecordEnvelope = Omit<LocalRecord, "_meta">;
export type ValidationResult = { ok: true; record: RecordEnvelope } | { ok: false; reason: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const kinds = ["space", "account", "category", "transaction", "budget", "borrower", "loan"];
const txTypes = ["income", "expense", "transfer", "lend", "loan_repayment", "adjustment", "reimbursement_claim", "reimbursement_payment", "investment_funding", "investment_withdrawal"];

/** Validate individual records only; references and derived accounting are intentionally not checked. */
export function validateRecord(raw: unknown, opts: { idPolicy: "uuid" | "any" }): ValidationResult {
  const bad = (reason: string): ValidationResult => ({ ok: false, reason });
  if (!isPlainObject(raw)) return bad("record must be an object");
  if (typeof raw["id"] !== "string" || !raw["id"].trim() || (opts.idPolicy === "uuid" ? !uuidPattern.test(raw["id"]) : raw["id"].length > 64)) return bad(`id must be ${opts.idPolicy === "uuid" ? "a UUID" : "a non-empty string up to 64 characters"}`);
  if (typeof raw["kind"] !== "string" || !kinds.includes(raw["kind"])) return bad("kind must be a supported record kind");
  if (raw["space_id"] !== null && typeof raw["space_id"] !== "string") return bad("space_id must be a string or null");
  if (!isPlainObject(raw["data"])) return bad("data must be an object");
  if (typeof raw["deleted"] !== "boolean") return bad("deleted must be a boolean");
  for (const field of ["created_at", "updated_at"]) {
    if (typeof raw[field] !== "string" || !Number.isFinite(Date.parse(raw[field]))) return bad(`${field} must be a parseable date string`);
  }
  if (raw["deleted"]) return { ok: true, record: raw as unknown as RecordEnvelope };
  const d = raw["data"];
  const errors: string[] = [];
  const text = (key: string, optional = false, max = 5000, min = 0) => {
    if (optional && d[key] === undefined) return;
    if (typeof d[key] !== "string" || d[key].length < min || d[key].length > max) errors.push(`${key} must be a string of ${min}-${max} characters`);
  };
  const choice = (key: string, values: string[], optional = false) => {
    if (optional && d[key] === undefined) return;
    if (typeof d[key] !== "string" || !values.includes(d[key])) errors.push(`${key} must be ${values.join(" or ")}`);
  };
  const bool = (key: string) => { if (d[key] !== undefined && typeof d[key] !== "boolean") errors.push(`${key} must be a boolean`); };
  const money = (key: string, min: number, optional = false) => {
    if (optional && d[key] === undefined) return;
    const value = d[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > MAX_CENTAVOS) errors.push(`${key} must be a whole number between ${min} and ${MAX_CENTAVOS}`);
  };
  const date = (key: string) => { if (typeof d[key] !== "string" || !isValidDate(d[key])) errors.push(`${key} must be a valid YYYY-MM-DD date`); };
  switch (raw["kind"]) {
    case "space":
      text("name", false, 200, 1); choice("type", ["personal", "managed"]); bool("archived"); text("note", true); text("parent_space_id", true); choice("purpose", ["reimbursement"], true);
      if (d["modules"] !== undefined) {
        if (!isPlainObject(d["modules"])) errors.push("modules must be an object");
        else for (const key of ["reimbursements", "investments"]) if (d["modules"][key] !== undefined && typeof d["modules"][key] !== "boolean") errors.push(`modules.${key} must be a boolean`);
      }
      break;
    case "account": text("name", false, 1000, 1); choice("type", ["cash", "bank", "ewallet", "savings", "other"]); bool("archived"); break;
    case "category": text("name", false, 1000, 1); choice("type", ["income", "expense"]); bool("archived"); choice("system", ["fee"], true); break;
    case "borrower": text("name", false, 1000); text("note", true); bool("archived"); break;
    case "budget":
      text("category_id"); money("amount", 0);
      if (typeof d["month"] !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(d["month"])) errors.push("month must be YYYY-MM");
      break;
    case "loan":
      text("borrower_id"); text("account_id"); money("principal", 0); date("date");
      for (const key of ["due_date", "settled_at", "note", "label", "platform", "reference"]) text(key, true);
      choice("module", ["reimbursement", "investment"], true); choice("status", ["unsubmitted", "submitted"], true); money("max_loss", 0, true);
      break;
    case "transaction":
      choice("type", txTypes); date("date"); money("amount", d["type"] === "adjustment" ? -MAX_CENTAVOS : 1);
      if (d["amount"] === 0) errors.push("amount must not be zero");
      text("account_id"); money("fee", 0, true); money("reimbursable", 0, true);
      for (const key of ["category_id", "fee_category_id", "to_account_id", "loan_id", "note"]) text(key, true);
      if (!Array.isArray(d["entries"]) || d["entries"].length < 1 || d["entries"].length > 20) errors.push("entries must be an array of 1-20 items");
      else d["entries"].forEach((e: unknown, i: number) => {
        if (!isPlainObject(e)) { errors.push(`entries[${i}] must be an object`); return; }
        if (typeof e["delta"] !== "number" || !Number.isSafeInteger(e["delta"]) || Math.abs(e["delta"]) > MAX_CENTAVOS) errors.push(`entries[${i}].delta must be a whole number within the money limit`);
        if (typeof e["account_id"] !== "string" && typeof e["loan_id"] !== "string") errors.push(`entries[${i}] must contain account_id or loan_id as a string`);
        for (const key of ["account_id", "loan_id", "category_id"]) if (e[key] !== undefined && typeof e[key] !== "string") errors.push(`entries[${i}].${key} must be a string`);
        if (e["report"] !== undefined && e["report"] !== "income" && e["report"] !== "expense") errors.push(`entries[${i}].report must be income or expense`);
      });
      break;
  }
  return errors[0] ? bad(errors[0]) : { ok: true, record: raw as unknown as RecordEnvelope };
}
