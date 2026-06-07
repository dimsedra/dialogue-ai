import { describe, it, expect } from "vitest";
import {
  buildSessionsListFilter,
  buildSessionsGetFilter,
  listSessionsQuery,
  getSessionQuery,
} from "./chatSessions";

describe("chatSessions: buildSessionsListFilter", () => {
  it("filters by user and workspace_agnostic when no workspace is specified", () => {
    expect(buildSessionsListFilter({ userId: "user123" })).toBe('user = "user123" && (workspace = null || workspace = "")');
  });

  it("filters by user and workspace when workspaceId is specified", () => {
    expect(buildSessionsListFilter({ userId: "user123", workspaceId: "ws456" })).toBe('user = "user123" && workspace = "ws456"');
  });

  it("filters by user only when allWorkspaces is true", () => {
    expect(buildSessionsListFilter({ userId: "user123", allWorkspaces: true })).toBe('user = "user123"');
  });
});

describe("chatSessions: buildSessionsGetFilter", () => {
  it("returns a filter for a specific session and user", () => {
    expect(buildSessionsGetFilter({ id: "session123", userId: "user456" })).toBe('id = "session123" && user = "user456"');
  });
});

describe("chatSessions: descriptors shape", () => {
  it("listSessionsQuery and getSessionQuery have correct collection metadata", () => {
    expect(listSessionsQuery._pb.collection).toBe("chat_sessions");
    expect(listSessionsQuery._pb.kind).toBe("list");
    expect(getSessionQuery._pb.collection).toBe("chat_sessions");
    expect(getSessionQuery._pb.kind).toBe("first");
  });
});
