import { describe, expect, it } from "vitest";
import { csvCell, exportSpaceCsv } from "@/lib/csv";
import { LedgerStore, memoryPersistence } from "@/lib/store";
import { createAccount, createSpace } from "@/lib/actions";

describe("Batch 1 CSV export", () => {
  it("guards formula text including whitespace but keeps negative money numeric", () => {
    for (const text of ["=1", "+1", "-1", "@x", " \t\r =1"])
      expect(csvCell(text)).toBe(`"'${text}"`);
    expect(csvCell("-500.00", "numeric")).toBe('"-500.00"');
    expect(csvCell('A "quote"')).toBe('"A ""quote"""');
  });
  it("exports only the selected space, excluding managed children, other spaces, and deleted rows", async () => {
    const store = new LedgerStore(memoryPersistence());
    const id = await createSpace(store, "Personal", "personal");
    const other = await createSpace(store, "Other", "personal");
    const child = await createSpace(store, "Managed child", "managed", id);
    await createAccount(store, id, "Cash", "cash", 0);
    for (const [spaceId, note] of [
      [id, "=personal"],
      [other, "other only"],
      [child, "child only"],
    ])
      await store.save("transaction", spaceId ?? null, {
        type: "adjustment",
        date: "2026-11-01",
        amount: -50000,
        account_id: "cash",
        note,
        entries: [{ account_id: "cash", delta: -50000 }],
      });
    const deleted = await store.save("transaction", id, {
      type: "adjustment",
      date: "2026-11-01",
      amount: 1,
      account_id: "cash",
      note: "deleted only",
      entries: [{ account_id: "cash", delta: 1 }],
    });
    await store.remove([deleted.id]);
    const snap = store.getSnapshot();
    const space = snap.spaces.find((s) => s.id === id);
    if (!space) throw new Error("Missing test space");
    const csv = exportSpaceCsv(snap, space, "2026-11-01", "2026-11-30");
    expect(csv.filename).toBe("Personal-2026-11-01-2026-11-30.csv");
    expect(csv.body.split("\r\n")).toHaveLength(2);
    expect(csv.body).toContain('"\'=personal"');
    expect(csv.body).toContain('"-500.00"');
    expect(csv.body).toContain('"01/11/2026"');
    for (const note of ["other only", "child only", "deleted only"])
      expect(csv.body).not.toContain(note);
    expect(() => exportSpaceCsv(snap, space, "2026-11-30", "2026-11-01")).toThrow("valid dates");
  });
});
