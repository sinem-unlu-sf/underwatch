import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, api, buildQuery } from "./client";

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => vi.unstubAllGlobals());

async function failure(p: Promise<unknown>): Promise<ApiRequestError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiRequestError) return e;
    throw e;
  }
  throw new Error("expected rejection");
}

describe("api client", () => {
  it("builds query strings without empty values", () => {
    expect(buildQuery({ a: "x", b: undefined, c: "", d: 0, e: null })).toBe("?a=x&d=0");
    expect(buildQuery({})).toBe("");
  });

  it("reports unreachable when fetch throws", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const e = await failure(api.health());
    expect(e.kind).toBe("unreachable");
  });

  it("reports unreachable when the dev proxy answers 5xx without a JSON body", async () => {
    mockFetch(() => Promise.resolve(new Response("", { status: 500 })));
    const e = await failure(api.overview());
    expect(e.kind).toBe("unreachable");
  });

  it("surfaces ApiError bodies with their code", async () => {
    mockFetch(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { code: "not_found", message: "Run not found" } }), { status: 404 })),
    );
    const e = await failure(api.run("run_missing"));
    expect(e.kind).toBe("http");
    expect(e.code).toBe("not_found");
    expect(e.status).toBe(404);
  });

  it("rejects 200 responses that do not match the shared contract", async () => {
    mockFetch(() => Promise.resolve(new Response(JSON.stringify({ items: "nope", total: -1 }), { status: 200 })));
    const e = await failure(api.runs({}));
    expect(e.kind).toBe("contract");
    expect(Array.isArray(e.details)).toBe(true);
  });
});
