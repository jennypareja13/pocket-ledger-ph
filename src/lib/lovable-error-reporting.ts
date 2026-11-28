import { redactSensitiveErrorText } from "@/lib/error-redaction";

type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  track?: (event: string, properties?: Record<string, unknown>) => string | null;
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
    __lovableReportRuntimeError?: (payload: {
      message: string;
      stack?: string;
      filename?: string;
    }) => void;
  }
}

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const safeError = redactError(error);
  window.__lovableEvents?.captureException?.(
    safeError,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
  // Prod React does not rethrow boundary-caught errors to window.onerror, so the
  // editor's telemetry never sees them. Forward the redacted error to lovable.js's
  // reporting hook, which is present only inside the editor preview.
  window.__lovableReportRuntimeError?.({
    message: safeError.message,
    ...(safeError.stack !== undefined && { stack: safeError.stack }),
    filename: window.location.pathname,
  });
}

function redactError(error: unknown): Error {
  const safeError = new Error(redactSensitiveErrorText(describeThrown(error)));
  if (error instanceof Error) {
    safeError.name = redactSensitiveErrorText(error.name);
    if (error.stack) safeError.stack = redactSensitiveErrorText(error.stack);
  }
  return safeError;
}

const MAX_SERIALIZED_LENGTH = 2000;

// Loaders and server fns throw raw Responses and plain objects (a Supabase
// { message, code, details }), which String() reduces to "[object ...]".
function describeThrown(error: unknown): string {
  if (error instanceof Response) {
    return `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  const { message } = (error ?? {}) as { message?: unknown };
  if (typeof message === "string" && message.length > 0) return message;
  try {
    return JSON.stringify(error)?.slice(0, MAX_SERIALIZED_LENGTH) ?? String(error);
  } catch {
    return String(error);
  }
}
