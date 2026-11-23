import { spawn } from "node:child_process";

const origin = "http://127.0.0.1:4173";
const routes = ["/", "/bnpl", "/auth", "/transactions"];
const server = spawn(
  "bun",
  ["run", "preview", "--", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
  {
    stdio: "inherit",
  },
);

function entryFingerprint(html) {
  const match = html.match(
    /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']([^"']+)["'])[^>]*>/i,
  );
  if (!match?.[1]) return null;
  const url = new URL(match[1], origin);
  return url.origin === origin && url.pathname.startsWith("/assets/") ? url.pathname : null;
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error("Vite preview exited before becoming ready.");
    try {
      const response = await fetch(origin + "/");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Vite preview did not become ready within 30 seconds.");

  const fingerprints = new Map();
  for (const route of routes) {
    const response = await fetch(origin + route, { headers: { Accept: "text/html" } });
    if (!response.ok)
      throw new Error("Production route " + route + " returned HTTP " + response.status);
    const fingerprint = entryFingerprint(await response.text());
    if (!fingerprint)
      throw new Error("Production route " + route + " did not expose a module entry script.");
    fingerprints.set(route, fingerprint);
  }

  const rootFingerprint = fingerprints.get("/");
  for (const [route, fingerprint] of fingerprints) {
    if (fingerprint !== rootFingerprint) {
      throw new Error(
        "Entry fingerprint differs for " + route + ": " + fingerprint + " vs " + rootFingerprint,
      );
    }
  }
  process.stdout.write("Production route entry fingerprint verified:\n");
  for (const [route, fingerprint] of fingerprints) {
    process.stdout.write(route + " -> " + fingerprint + "\n");
  }
} finally {
  server.kill("SIGTERM");
}
