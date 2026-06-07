// use-action.test.ts — pure-function tests for executePbAction.
// The hook itself is not rendered (no jsdom installed); the descriptor
// type-level test lives in convex/pb-compat-types.test.ts.

import { describe, it, expect, vi } from "vitest";
import { executePbAction, defineAction } from "./use-action";

const makeMockFetch = (
  responder: (url: string, init: RequestInit) => Promise<Response> | Response,
) => {
  return vi.fn(responder) as unknown as typeof fetch;
};

const okJson = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const errJson = (status: number, text: string): Response =>
  new Response(text, { status });

describe("pb-compat: executePbAction", () => {
  it("POSTs args to /api/pb-action/<name> as JSON", async () => {
    const fetchImpl = makeMockFetch((url, init) => {
      expect(url).toBe("/api/pb-action/parseDate");
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
      expect(JSON.parse(init.body as string)).toEqual({ args: { text: "tomorrow" } });
      return okJson({ ok: true, result: "2026-06-08T00:00:00Z" });
    });
    const result = await executePbAction<string>(
      defineAction("parseDate"),
      { text: "tomorrow" },
      { token: null, fetchImpl },
    );
    expect(result).toBe("2026-06-08T00:00:00Z");
  });

  it("forwards Bearer token when present", async () => {
    const fetchImpl = makeMockFetch((_url, init) => {
      expect(init.headers).toMatchObject({ Authorization: "Bearer t0k3n" });
      return okJson({ ok: true, result: null });
    });
    await executePbAction(
      defineAction("parseDate"),
      { text: "x" },
      { token: "t0k3n", fetchImpl },
    );
  });

  it("omits Authorization header when no token", async () => {
    const fetchImpl = makeMockFetch((_url, init) => {
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
      return okJson({ ok: true, result: null });
    });
    await executePbAction(
      defineAction("parseDate"),
      { text: "x" },
      { token: null, fetchImpl },
    );
  });

  it("throws on non-OK status with status + body", async () => {
    const fetchImpl = makeMockFetch(() => errJson(500, "boom"));
    await expect(
      executePbAction(defineAction("parseDate"), { text: "x" }, { token: null, fetchImpl }),
    ).rejects.toThrow(/parseDate.*500.*boom/);
  });

  it("throws on { ok: false, error } response", async () => {
    const fetchImpl = makeMockFetch(() => okJson({ ok: false, error: "bad input" }));
    await expect(
      executePbAction(defineAction("parseDate"), { text: "x" }, { token: null, fetchImpl }),
    ).rejects.toThrow(/parseDate.*bad input/);
  });

  it("returns the result field on success", async () => {
    const fetchImpl = makeMockFetch(() => okJson({ ok: true, result: { id: "abc" } }));
    const result = await executePbAction<{ id: string }>(
      defineAction("createX"),
      { foo: 1 },
      { token: null, fetchImpl },
    );
    expect(result).toEqual({ id: "abc" });
  });
});
