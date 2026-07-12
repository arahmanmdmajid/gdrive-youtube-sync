import { createServer } from "vite";

const server = await createServer({ configFile: "./vite.config.ts" });
await server.listen();
server.printUrls();

process.on("SIGINT", () => server.close().then(() => process.exit(0)));
process.on("SIGTERM", () => server.close().then(() => process.exit(0)));
