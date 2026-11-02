import { describe, expect, it, vi } from "vitest";
import { classifyRemoteError } from "@/lib/remote";
import { RecordRejected, SyncAbort } from "@/lib/sync-engine";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

describe("Batch 2 remote error classification", () => {
  it.each([
    { status: 401, code: "OTHER", message: "denied", expected: SyncAbort },
    { status: 400, code: "PGRST301", message: "expired", expected: SyncAbort },
    { status: 400, code: "PGRST302", message: "expired", expected: SyncAbort },
    { status: 400, code: "OTHER", message: "JWT expired", expected: SyncAbort },
    { status: 403, code: "42501", message: "authentication required", expected: SyncAbort },
    { status: 500, code: "PGRST000", message: "unavailable", expected: Error },
    { status: 503, code: "PGRST000", message: "unavailable", expected: Error },
    { status: 408, code: "TIMEOUT", message: "timeout", expected: Error },
    { status: 429, code: "RATE_LIMIT", message: "slow down", expected: Error },
    { status: 400, code: "PGRST204", message: "invalid field", expected: RecordRejected },
    { status: 403, code: "NON_NUMERIC", message: "denied", expected: RecordRejected },
    { status: 400, code: "23514", message: "constraint", expected: Error },
    { status: 403, code: "42501", message: "denied", expected: Error },
    { status: undefined, code: undefined, message: "network failed", expected: Error },
  ])("classifies $status / $code / $message", ({ status, code, message, expected }) => {
    const error = classifyRemoteError({ status, code, message });
    expect(error.constructor).toBe(expected);
    expect(error.message).toBe(message);
  });

  it("uses explicit HTTP status before the error status", () => {
    expect(classifyRemoteError({ status: 400, code: "PGRST000", message: "unavailable" }, 503).constructor).toBe(Error);
  });
});