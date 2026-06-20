import { definePaginatedQuery } from "../use-paginated-query";

export const usePbMessagesPaginated = definePaginatedQuery<{
  sessionId: string;
  parentSessionId?: string;
  branchedFromTimestamp?: number;
}>({
  collection: "messages",
  buildFilter: (args) => {
    if (args.parentSessionId && args.branchedFromTimestamp) {
      return `session = "${args.sessionId}" || (session = "${args.parentSessionId}" && timestamp <= ${args.branchedFromTimestamp})`;
    }
    return `session = "${args.sessionId}"`;
  },
});

