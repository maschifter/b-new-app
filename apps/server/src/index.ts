import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function start() {
  const config = loadConfig();
  const app = await buildApp(config);
  await app.listen({ port: config.PORT, host: config.HOST });
}

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
