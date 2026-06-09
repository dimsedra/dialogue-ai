import { definePaginatedQuery } from "../use-paginated-query";

export const usePbMessagesPaginated = definePaginatedQuery<{ sessionId: string }>({
  collection: "messages",
  buildFilter: (args) => `session = "${args.sessionId}"`,
});
