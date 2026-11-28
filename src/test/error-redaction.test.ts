import { afterEach, describe, expect, it, vi } from "vitest";
import { redactSensitiveErrorText } from "@/lib/error-redaction";
import { describeError } from "@/lib/error-capture";
import { reportLovableError } from "@/lib/lovable-error-reporting";

describe("sensitive error text redaction", () => {
  it("redacts long digit runs, email-like strings, and URL query values", () => {
    const input =
      "Account 1234567890123456 for jenny.pareja@example.com failed at https://example.test/reset?code=secret-code&state=private";
    const output = redactSensitiveErrorText(input);

    expect(output).toBe(
      "Account [REDACTED] for [REDACTED] failed at https://example.test/reset?code=[REDACTED]&state=[REDACTED]",
    );
    expect(output).not.toContain("1234567890123456");
    expect(output).not.toContain("jenny.pareja@example.com");
    expect(output).not.toContain("secret-code");
    expect(output).not.toContain("private");
  });

  it("keeps ordinary diagnostics intact", () => {
    expect(redactSensitiveErrorText("Network request failed with status 503")).toBe(
      "Network request failed with status 503",
    );
  });

  it("redacts message and stack text before server error logging", () => {
    const error = new Error(
      "Failed to process 9876543210987654 for jenny.pareja@example.com",
    );
    error.stack =
      "Error: Failed to process 9876543210987654 for jenny.pareja@example.com\n    at https://example.test/api?token=private-token";

    const output = describeError(error);

    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("9876543210987654");
    expect(output).not.toContain("jenny.pareja@example.com");
    expect(output).not.toContain("private-token");
  });

  it("passes redacted messages and stacks to Lovable telemetry hooks", () => {
    const captureException = vi.fn();
    const reportRuntimeError = vi.fn();
    const previousEvents = window.__lovableEvents;
    const previousReporter = window.__lovableReportRuntimeError;
    window.__lovableEvents = { captureException };
    window.__lovableReportRuntimeError = reportRuntimeError;

    try {
      const error = new Error("Payment 123456789 for jenny.pareja@example.com");
      error.stack =
        "Error: Payment 123456789 for jenny.pareja@example.com\n    at https://example.test/path?access_token=secret";

      reportLovableError(error);

      const sentError = captureException.mock.calls[0]?.[0];
      expect(sentError).toBeInstanceOf(Error);
      expect((sentError as Error).message).toContain("[REDACTED]");
      expect((sentError as Error).stack).not.toContain("123456789");
      expect((sentError as Error).stack).not.toContain("jenny.pareja@example.com");
      expect((sentError as Error).stack).not.toContain("access_token=secret");

      const payload = reportRuntimeError.mock.calls[0]?.[0] as {
        message: string;
        stack?: string;
      };
      expect(payload.message).not.toContain("123456789");
      expect(payload.message).not.toContain("jenny.pareja@example.com");
      expect(payload.stack).not.toContain("access_token=secret");
    } finally {
      window.__lovableEvents = previousEvents;
      window.__lovableReportRuntimeError = previousReporter;
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
