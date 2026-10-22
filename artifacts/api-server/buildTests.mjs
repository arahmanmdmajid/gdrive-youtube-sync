// Bundles src/**/*.test.ts into dist/test so node --test can run them. The sources import the
// workspace packages and extensionless paths, which node cannot load directly.
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
  external: ["pg-native", "googleapis"],
  // pg and other CommonJS packages are bundled into an ES module, so give them require/__dirname.
  banner: {
    js: `import { createRequire as __cr } from 'node:module';
import __p from 'node:path';
import __u from 'node:url';
globalThis.require = __cr(import.meta.url);
globalThis.__filename = __u.fileURLToPath(import.meta.url);
globalThis.__dirname = __p.dirname(globalThis.__filename);`,
  },
});
