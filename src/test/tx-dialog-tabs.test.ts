import { describe, expect, it } from "vitest";
import { availableTxTabs } from "@/components/app/TxDialog";

describe("availableTxTabs", () => {
  it("shows only the ordinary transaction types for a new transaction", () => {
    expect(availableTxTabs({})).toEqual(["expense", "income", "transfer"]);
  });

  it("locks a new lending or repayment dialog to its preset type", () => {
    expect(availableTxTabs({ preset: { type: "lend" } })).toEqual(["lend"]);
    expect(availableTxTabs({ preset: { type: "loan_repayment" } })).toEqual([
      "loan_repayment",
    ]);
  });

  it("locks edits of lending and repayment transactions to their existing type", () => {
    expect(availableTxTabs({ edit: { data: { type: "lend" } } })).toEqual(["lend"]);
    expect(availableTxTabs({ edit: { data: { type: "loan_repayment" } } })).toEqual([
      "loan_repayment",
    ]);
  });

  it("keeps the ordinary tabs available when editing an ordinary transaction", () => {
    expect(availableTxTabs({ edit: { data: { type: "expense" } } })).toEqual([
      "expense",
      "income",
      "transfer",
    ]);
  });

  it("keeps the ordinary tabs available for a transfer preset", () => {
    expect(availableTxTabs({ preset: { type: "transfer" } })).toEqual([
      "expense",
      "income",
      "transfer",
    ]);
  });
});
