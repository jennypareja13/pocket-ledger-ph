const FRAME_ANCESTORS =
  "'self' https://lovable.dev https://*.lovable.dev https://*.lovableproject.com";

function readRuntimeValue(env: unknown, key: string): string | undefined {
  if (typeof env === "object" && env !== null && key in env) {
    const value = (env as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  if (typeof process !== "undefined") {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return undefined;
}

function getSupabaseOrigins(env: unknown): string[] {
  const configuredUrl =
    readRuntimeValue(env, "VITE_SUPABASE_URL") ?? readRuntimeValue(env, "SUPABASE_URL");

  if (!configuredUrl) {
    // The report-only policy must not prevent the app from reaching its configured
    // Supabase project if the hosting runtime does not expose the URL to this entry.
    return ["https://*.supabase.co", "wss://*.supabase.co"];
  }

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    const websocketOrigin = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, `${websocketOrigin}//${url.host}`];
  } catch {
    return [];
  }
}

export function buildReportOnlyContentSecurityPolicy(env: unknown): string {
  const supabaseOrigins = getSupabaseOrigins(env);
  const connectSources = [
    "'self'",
    ...supabaseOrigins,
    "https://accounts.google.com",
    "https://oauth2.googleapis.com",
    "https://lovable.dev",
    "https://*.lovable.dev",
    "https://*.lovableproject.com",
  ];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `frame-ancestors ${FRAME_ANCESTORS}`,
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://lovable.dev https://*.lovable.dev https://*.lovableproject.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://lovable.dev https://*.lovable.dev https://*.lovableproject.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src ${connectSources.join(" ")}`,
    "frame-src 'self' https://accounts.google.com https://*.supabase.co https://lovable.dev https://*.lovable.dev https://*.lovableproject.com",
    "form-action 'self' https://accounts.google.com https://lovable.dev https://*.lovable.dev",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

export function withSecurityHeaders(response: Response, env: unknown): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  );
  headers.set("Content-Security-Policy", `frame-ancestors ${FRAME_ANCESTORS}`);
  headers.set("Content-Security-Policy-Report-Only", buildReportOnlyContentSecurityPolicy(env));

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
