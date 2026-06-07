// parseDate action — Phase 2 stub (B.4).
//
// Convex source: convex/background_jobs.ts:460
//   - Takes { text, timezoneOffset?, userId? }.
//   - Looks up the user's profile to find the LLM provider + model.
//   - Calls an LLM with a prompt that converts natural language to ISO-8601.
//   - Returns the ISO string or null if invalid.
//
// What this stub does:
//   - Returns null. The real implementation requires B.7-grade integration:
//     per-user profile lookup, LLM call via the AI SDK, and result parsing.
//   - The handler is registered so the dispatcher's POST /api/pb-action/parseDate
//     resolves cleanly and the route can be smoke-tested end-to-end.
//
// TODO(real-impl, B.7): port the LLM call from convex/background_jobs.ts:460.
//   - Get user profile (with revealKeys=true) from PB.
//   - Resolve LLM provider + modelId via getTaskProviderAndModel(profile, "title").
//   - Call runSimpleTask with the same prompt as the Convex version.
//   - Return the trimmed responseText or null.

import type { PbActionHandler } from "./registry";

interface ParseDateArgs {
  text: string;
  timezoneOffset?: number;
  userId?: string;
}

export const parseDate: PbActionHandler<ParseDateArgs, string | null> = async (
  _args,
  _ctx,
) => {
  // Stub: see TODO above. Returning null matches the "couldn't parse" path
  // so the action is testable as a registered route without breaking callers.
  return null;
};
