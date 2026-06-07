// Tests for the userProfile.get descriptor — Phase 2 Stage B.7.2.
//
// These tests exercise the pure helper `buildUserFilter` (the part of the
// descriptor that produces a PB filter string from the consumer's args).
// The descriptor's runtime behaviour is exercised end-to-end by the
// smoke script added in B.7.4; this file keeps the unit tests fast and
// dependency-free (no PocketBase instance, no React renderer).

import { describe, it, expect } from "vitest";
import {
  buildUserFilter,
  userProfileGetQuery,
  type UserProfileGetArgs,
} from "./userProfile";

describe("userProfile: buildUserFilter", () => {
  it("returns `user = <id>` for a valid user id", () => {
    expect(buildUserFilter({ user: "abc123" })).toBe('user = "abc123"');
  });

  it("escapes double quotes in the user id", () => {
    // Defensive: a malicious or buggy id should not break out of the
    // string and inject PB filter syntax. PB filter values are
    // double-quoted; embedded `"` must be backslash-escaped.
    expect(buildUserFilter({ user: 'has"quote' })).toBe(
      'user = "has\\"quote"',
    );
  });

  it("escapes backslashes in the user id", () => {
    // Backslash-escape must happen BEFORE the quote-escape to avoid
    // double-escaping. PB filter syntax uses backslash as the escape
    // character.
    expect(buildUserFilter({ user: "has\\backslash" })).toBe(
      'user = "has\\\\backslash"',
    );
  });

  it("returns a no-match filter when args is undefined", () => {
    // The no-match filter (`1 = 2`) is a tautological false: PB will
    // return zero records. useQuery's "first" shape returns undefined.
    expect(buildUserFilter(undefined)).toBe("1 = 2");
  });

  it("returns a no-match filter when args is not an object", () => {
    // Defense-in-depth: the descriptor's args type is `{ user: string }`,
    // but a runtime call could pass anything. Guard against it.
    expect(buildUserFilter("nope" as unknown as Record<string, unknown>)).toBe(
      "1 = 2",
    );
  });

  it("returns a no-match filter when the user field is missing", () => {
    expect(buildUserFilter({} as UserProfileGetArgs)).toBe("1 = 2");
  });

  it("returns a no-match filter when the user field is empty", () => {
    expect(buildUserFilter({ user: "" })).toBe("1 = 2");
  });

  it("returns a no-match filter when the user field is not a string", () => {
    expect(
      buildUserFilter({ user: 42 as unknown as string }),
    ).toBe("1 = 2");
  });
});

describe("userProfile: userProfileGetQuery shape", () => {
  it("is exposed as a function (callable) with _pb metadata", () => {
    expect(typeof userProfileGetQuery).toBe("function");
    const meta = userProfileGetQuery._pb;
    expect(meta.collection).toBe("user_profile");
    expect(meta.kind).toBe("first");
  });

  it("the descriptor's buildFilter is the buildUserFilter helper", () => {
    // Round-trip: the buildFilter on the descriptor produces the same
    // string as the standalone helper. This guards against a refactor
    // that drifts the two apart.
    const meta = userProfileGetQuery._pb;
    expect(typeof meta.buildFilter).toBe("function");
    expect(meta.buildFilter!({ user: "abc" })).toBe(
      buildUserFilter({ user: "abc" }),
    );
  });

  it("the descriptor does NOT set matchField (first kind uses buildFilter)", () => {
    // matchField is the id-match pattern for kind: "get". For
    // kind: "first" the filter does the work; matchField would be
    // misleading documentation.
    expect(userProfileGetQuery._pb.matchField).toBeUndefined();
  });
});
