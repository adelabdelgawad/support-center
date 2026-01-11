 
import { createSearchParamsCache, parseAsInteger, parseAsString, parseAsBoolean } from 'nuqs/server';

export const searchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  size: parseAsInteger.withDefault(10),
  search: parseAsString.withDefault(''),
  statusFilter: parseAsString.withDefault(''),
  activeFilter: parseAsBoolean,
});

export type TasksSearchParams = Awaited<ReturnType<typeof searchParamsCache.parse>>;
