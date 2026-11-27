import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const outputDirectory = ".output/server";
const manifestName = readdirSync(outputDirectory).find(
  (name) => name.startsWith("_tanstack-start-manifest_v-") && name.endsWith(".mjs"),
);

if (!manifestName) {
  throw new Error("The production TanStack Start route manifest was not generated.");
}

const manifest = readFileSync(join(outputDirectory, manifestName), "utf8");

function getRouteBlock(routeKey, startAt = 0) {
  const marker = routeKey === "__root__" ? "__root__: {" : '"' + routeKey + '": {';
  const start = manifest.indexOf(marker, startAt);
  if (start < 0) throw new Error("Production route manifest is missing " + routeKey);
  const end = manifest.indexOf("\n\t}", start);
  if (end < 0) throw new Error("Production route manifest block is incomplete for " + routeKey);
  return manifest.slice(start, end);
}

const rootBlock = getRouteBlock("__root__");
const entryMatch = rootBlock.match(/scripts:\s*\[\{\s*attrs:\s*\{[\s\S]*?src:\s*"([^"]+)"/);
const rootEntry = entryMatch?.[1];

if (!rootEntry || !rootEntry.startsWith("/assets/")) {
  throw new Error("The production root route does not declare one /assets/ module entry script.");
}

const routeKeys = [
  "/_shell/",
  "/auth",
  "/_shell/bnpl",
  "/_shell/transactions",
  "/reset-password",
  "/privacy-notice",
];
const routeEvidence = new Map();

for (const routeKey of routeKeys) {
  const block = getRouteBlock(routeKey);
  if (/\bscripts\s*:/.test(block)) {
    throw new Error(
      "Route " + routeKey + " declares a separate script entry instead of inheriting __root__.",
    );
  }
  const preloads = [...block.matchAll(/"([^"]+\.js)"/g)].map((match) => match[1]);
  routeEvidence.set(routeKey, preloads);
}

for (const [route, preloads] of routeEvidence) {
  if (preloads.length === 0) {
    throw new Error("Production route " + route + " did not expose its code-split preloads.");
  }
}

process.stdout.write(
  "Production route manifest: one inherited root module entry for all checked routes.\n",
);
process.stdout.write("__root__ script: " + rootEntry + "\n");
for (const [route, preloads] of routeEvidence) {
  process.stdout.write(route + " preloads: " + preloads.join(", ") + "\n");
}
process.stdout.write(
  "The route-specific preload lists differ; the update fingerprint intentionally uses only the root script entry.\n",
);
