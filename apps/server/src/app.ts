import cors from "@fastify/cors";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { ApiError } from "@kw/schema";
import { ALLOWED_ORIGINS, type DbLocation } from "./config";
import type { Db } from "./db/connection";
import { ApiHttpError } from "./errors";
import { registerRoutes } from "./routes";

export interface AppOptions {
  db: Db;
  dbLocation: DbLocation;
  env?: NodeJS.ProcessEnv;
  logger?: boolean;
  /** Validate every response against its contract schema. Defaults to on unless NODE_ENV=production. */
  validateResponses?: boolean;
}

function errorBody(code: ApiError["error"]["code"], message: string, details?: unknown): ApiError {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/** Builds the API without listening, so tests can drive it with app.inject. The caller owns the database handle. */
export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const env = opts.env ?? process.env;
  const app = Fastify({ logger: opts.logger ?? false });

  await app.register(cors, { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] });

  app.setErrorHandler((err: FastifyError | ApiHttpError, req, reply) => {
    if (err instanceof ApiHttpError) {
      if (err.statusCode >= 500) req.log.error({ err, details: err.details }, err.message);
      return reply.status(err.statusCode).send(errorBody(err.code, err.message, err.details));
    }
    const status = err.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply.status(status).send(errorBody("validation_error", err.message, err.code ? { fastify_code: err.code } : undefined));
    }
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send(errorBody("internal_error", "Internal server error."));
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send(errorBody("not_found", `No route for ${req.method} ${req.url.split("?")[0]}.`)),
  );

  registerRoutes(app, {
    db: opts.db,
    dbLocation: opts.dbLocation,
    env,
    validateResponses: opts.validateResponses ?? env.NODE_ENV !== "production",
  });

  return app;
}
