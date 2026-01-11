/**
 * Queries Index
 * Re-exports all query hooks for convenient imports
 */

export {
  // Tickets
  useAllUserTickets,
  useTicketDetail,
  useCreateTicket,
  useInfiniteTickets,
  // Messages
  useTicketMessages,
  useTicketMessagesCursor,
  // Cache utilities
  useAddMessageToCache,
  useUpdateTicketInCache,
  useTicketFromCache,
  usePrefetchMessages,
  // Keys
  ticketKeys,
  messageKeys,
  // Types
  type TransformedTicketPageData,
} from "./tickets";

export {
  // Search
  useSearchTickets,
  convertSearchResultToTicketListItem,
  // Keys
  searchKeys,
  // Types
  type SearchParams,
  type SearchResponse,
  type TicketSearchResult,
} from "./use-search";
