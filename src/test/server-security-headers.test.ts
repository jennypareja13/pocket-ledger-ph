import { describe, expect, it } from "vitest";
import { normalizeCatastrophicSsrResponse } from "../server";
import {
  buildReportOnlyContentSecurityPolicy,
  withSecurityHeaders,
} from "@/lib/security-headers";

describe("server security headers", () => {
  it("adds the requested headers while preserving the original response", async () => {
    const original = new Response("ok", {
      status: 201,
      headers: { "content-type": "text/plain", "x-existing": "preserved" },
    });

    const response = withSecurityHeaders(original, {
      VITE_SUPABASE_URL: "https://project-ref.supabase.co",
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("x-existing")).toBe("preserved");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovableproject.com",
    );
    expect(response.headers.get("x-frame-options")).toBeNull();
    expect(await response.text()).toBe("ok");
  });

  it("uses the configured Supabase project URL and its websocket origin in report-only CSP", () => {
    const policy = buildReportOnlyContentSecurityPolicy({
      VITE_SUPABASE_URL: "https://project-ref.supabase.co/",
    });

    expect(policy).toContain("https://project-ref.supabase.co");
    expect(policy).toContain("wss://project-ref.supabase.co");
    expect(policy).toContain("https://accounts.google.com");
    expect(policy).toContain("https://oauth2.googleapis.com");
    expect(policy).toContain("https://*.lovable.dev");
    expect(policy).toContain("https://*.lovableproject.com");
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
  });

  it("replaces a 5xx JSON body and diagnostic headers with a generic SSR error page", async () => {
    const response = new Response(
      JSON.stringify({
        name: "Error",
        message: "private diagnostic message",
        stack: "Error: private diagnostic message\\n    at secret-file.ts:10:2",
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
          "x-error-stack": "private stack header",
          "x-debug-error": "private diagnostic message",
        },
      },
    );

    const safeResponse = await normalizeCatastrophicSsrResponse(response);
    const headers = new Headers(safeResponse.headers);
    const body = await safeResponse.text();

    expect(safeResponse.status).toBe(500);
    expect(headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(headers.has("x-error-stack")).toBe(false);
    expect(headers.has("x-debug-error")).toBe(false);
    expect(body).toContain("This page didn't load");
    expect(body).not.toContain("private diagnostic message");
    expect(body).not.toContain("secret-file.ts");
    expect(body).not.toContain("stack");
  });

  it("does not rewrite successful SSR responses", async () => {
    const response = new Response("<main>SSR content</main>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    const safeResponse = await normalizeCatastrophicSsrResponse(response);

    expect(safeResponse).toBe(response);
    expect(await safeResponse.text()).toContain("SSR content");
  });
});
