import { describe, it, expect } from "vitest";
import {
  buildWorkspacesListFilter,
  buildWorkspacesGetFilter,
  workspacesListQuery,
  workspacesGetQuery,
} from "./workspaces";

describe("workspaces: buildWorkspacesListFilter", () => {
  it("returns `user = <id>` for a valid user id in args", () => {
    expect(buildWorkspacesListFilter({ userId: "abc123" })).toBe('user = "abc123"');
  });

  it("returns a no-match filter when user is missing or empty", () => {
    expect(buildWorkspacesListFilter(undefined)).toBe("1 = 2");
    expect(buildWorkspacesListFilter({})).toBe("1 = 2");
    expect(buildWorkspacesListFilter({ userId: "" })).toBe("1 = 2");
  });
});

describe("workspaces: buildWorkspacesGetFilter", () => {
  it("returns both id and user filters when id and user are provided", () => {
    expect(buildWorkspacesGetFilter({ id: "ws123", userId: "user456" })).toBe('id = "ws123" && user = "user456"');
  });

  it("returns a no-match filter when id or user is missing", () => {
    expect(buildWorkspacesGetFilter(undefined)).toBe("1 = 2");
    expect(buildWorkspacesGetFilter({ id: "ws123" })).toBe("1 = 2");
    expect(buildWorkspacesGetFilter({ userId: "user456" })).toBe("1 = 2");
  });
});

describe("workspaces: descriptors shape", () => {
  it("workspacesListQuery is a function with workspaces list metadata", () => {
    expect(typeof workspacesListQuery).toBe("function");
    expect(workspacesListQuery._pb.collection).toBe("workspaces");
    expect(workspacesListQuery._pb.kind).toBe("list");
  });

  it("workspacesGetQuery is a function with workspaces first metadata", () => {
    expect(typeof workspacesGetQuery).toBe("function");
    expect(workspacesGetQuery._pb.collection).toBe("workspaces");
    expect(workspacesGetQuery._pb.kind).toBe("first");
  });
});
