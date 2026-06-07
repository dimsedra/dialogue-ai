import { describe, it, expect } from "vitest";
import {
  buildPersonasListFilter,
  personasListQuery,
} from "./personas";

describe("personas: buildPersonasListFilter", () => {
  it("filters by user id", () => {
    expect(buildPersonasListFilter({ userId: "user123" })).toBe('user = "user123"');
  });

  it("returns a no-match filter when user is missing", () => {
    expect(buildPersonasListFilter(undefined)).toBe("1 = 2");
  });
});

describe("personas: descriptor shape", () => {
  it("personasListQuery is list metadata", () => {
    expect(personasListQuery._pb.collection).toBe("agent_personas");
    expect(personasListQuery._pb.kind).toBe("list");
  });
});
