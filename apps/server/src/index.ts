import { buildApp } from "./app";
import { HOST, resolveDbLocation, resolvePort } from "./config";
import { openDatabase } from "./db/connection";

const dbLocation = resolveDbLocation();
const db = openDatabase(dbLocation.path);
const app = await buildApp({ db, dbLocation, logger: true });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  db.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: HOST, port: resolvePort() });
  app.log.info(`database: ${dbLocation.path} (${dbLocation.configuredVia})`);
} catch (err) {
  app.log.error(err);
  db.close();
  process.exit(1);
}
