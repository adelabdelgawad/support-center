 
import { createLoader, parseAsInteger, parseAsString } from "nuqs/server";

// Define your search params schema
export const searchParamsParser = {
  page: parseAsInteger.withDefault(1),
  limit: parseAsInteger.withDefault(10),
  include_inactive: parseAsString.withDefault(''),
  search: parseAsString.withDefault(''),
  isp_ids: parseAsString.withDefault(''),
};

// Create the loader
export const loadSearchParams = createLoader(searchParamsParser);