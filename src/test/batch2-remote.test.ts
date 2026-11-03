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
    { status: 403, code: "OTHER", message: "not authenticated", expected: SyncAbort },
    { status: 403, code: "OTHER", message: "unauthenticated", expected: SyncAbort },
    { status: 403, code: "42501", message: "authentication required", expected: RecordRejected },
    { status: 500, code: "PGRST000", message: "unavailable", expected: Error },
    { status: 503, code: "PGRST000", message: "unavailable", expected: Error },
    { status: 503, code: "23505", message: "unavailable", expected: Error },
    { status: 408, code: "TIMEOUT", message: "timeout", expected: Error },
    { status: 429, code: "RATE_LIMIT", message: "slow down", expected: Error },
    { status: 400, code: "PGRST204", message: "invalid field", expected: RecordRejected },
    { status: 403, code: "NON_NUMERIC", message: "denied", expected: RecordRejected },
    { status: 400, code: "23514", message: "constraint", expected: RecordRejected },
    { status: 409, code: "23505", message: "duplicate key", expected: RecordRejected },
    { status: 403, code: "42501", message: "permission denied", expected: RecordRejected },
    { status: undefined, code: undefined, message: "network failed", expected: Error },
    { status: undefined, code: "", message: "Failed to fetch", expected: Error },
  ])("classifies $status / $code / $message", ({ status, code, message, expected }) => {
    const error = classifyRemoteError({ status, code, message });
    expect(error.constructor).toBe(expected);
    expect(error.message).toBe(message);
  });

  it("uses explicit HTTP status before the error status", () => {
    expect(
      classifyRemoteError({ status: 400, code: "PGRST000", message: "unavailable" }, 503)
        .constructor,
    ).toBe(Error);
  });
});
