import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { openDatabase, type Db } from "../db/connection";

export interface TestContext {
  db: Db;
  app: FastifyInstance;
  close: () => Promise<void>;
}

export async function createTestApp(env: NodeJS.ProcessEnv = {}): Promise<TestContext> {
  const db = openDatabase(":memory:");
  const app = await buildApp({ db, dbLocation: { path: ":memory:", configuredVia: "test" }, env, validateResponses: true });
  return {
    db,
    app,
    close: async () => {
      await app.close();
      db.close();
    },
  };
}

export function tableCount(db: Db, table: string): number {
  return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
}

export async function getJson<T = any>(app: FastifyInstance, url: string): Promise<{ status: number; body: T }> {
  const res = await app.inject({ method: "GET", url });
  return { status: res.statusCode, body: res.json() as T };
}

export async function postJson<T = any>(app: FastifyInstance, url: string, payload: unknown): Promise<{ status: number; body: T }> {
  const res = await app.inject({ method: "POST", url, payload: payload as object });
  return { status: res.statusCode, body: res.json() as T };
}
