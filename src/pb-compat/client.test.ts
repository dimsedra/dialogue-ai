import { describe, test, expect, beforeEach } from "vitest";
import {
  getPbClient,
  resolvePbUrl,
  __resetPbClientForTests,
} from "./client";

describe("resolvePbUrl", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_PB_URL;
    __resetPbClientForTests();
  });

  test("returns the default when NEXT_PUBLIC_PB_URL is unset", () => {
    expect(resolvePbUrl()).toBe("http://127.0.0.1:8090");
  });

  test("returns the env value when NEXT_PUBLIC_PB_URL is set", () => {
    process.env.NEXT_PUBLIC_PB_URL = "http://example.test:9999";
    expect(resolvePbUrl()).toBe("http://example.test:9999");
  });

  test("falls back to default when NEXT_PUBLIC_PB_URL is empty string", () => {
    process.env.NEXT_PUBLIC_PB_URL = "";
    expect(resolvePbUrl()).toBe("http://127.0.0.1:8090");
  });
});

describe("getPbClient", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_PB_URL;
    __resetPbClientForTests();
  });

  test("returns a PocketBase client (singleton identity check)", () => {
    const a = getPbClient();
    const b = getPbClient();
    expect(a).toBe(b); // exact same instance — singleton
  });

  test("client's baseUrl reflects the resolved env URL", () => {
    process.env.NEXT_PUBLIC_PB_URL = "http://example.test:9999";
    const client = getPbClient();
    // The SDK exposes the baseUrl via `client.baseUrl` in 0.27.x.
    expect(client.baseUrl).toBe("http://example.test:9999");
  });

  test("client's baseUrl falls back to the default when env is unset", () => {
    const client = getPbClient();
    expect(client.baseUrl).toBe("http://127.0.0.1:8090");
  });

  test("__resetPbClientForTests() forces the next call to rebuild", () => {
    const first = getPbClient();
    __resetPbClientForTests();
    const second = getPbClient();
    expect(first).not.toBe(second);
    // Both should still be valid clients with the same baseUrl.
    expect(first.baseUrl).toBe(second.baseUrl);
  });
});

