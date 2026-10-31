// Bundles src/**/*.test.ts into dist/test so node --test can run them (sources use extensionless imports).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, statSync } from "node:fs";
import { build } from "esbuild";

const dir = path.dirname(fileURLToPath(import.meta.url));

function findTests(d) {
  return readdirSync(d).flatMap((name) => {
    const p = path.join(d, name);
    if (statSync(p).isDirectory()) return findTests(p);
    return name.endsWith(".test.ts") ? [p] : [];
  });
}

await build({
  entryPoints: findTests(path.join(dir, "src")),
  outdir: path.join(dir, "dist/test"),
  outExtension: { ".js": ".mjs" },
  platform: "node",
  bundle: true,
  format: "esm",
  logLevel: "warning",
});
