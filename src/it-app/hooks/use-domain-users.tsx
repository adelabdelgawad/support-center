"use client";

import useSWR, { SWRConfiguration, SWRResponse, KeyedMutator } from "swr";
import { apiClient } from "@/lib/fetch/client";
import type { AuthUserResponse } from "@/types/users";

/**
 * Authentication user from API (local or AD-authenticated).
 * For actual AD domain users, see lib/api/domain-users.ts
 */
export interface AuthUser {
  id: number;
  username: string;
  fullName?: string;
  title?: string;
  email?: string;
}

/**
 * Paginated response for authentication users.
 */
export interface AuthUsersResponse {
  users: AuthUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface UseAuthUsersParams {
  search?: string;
  page?: number;
  limit?: number;
  enabled?: boolean;
}

interface UseAuthUsersReturn {
  data: AuthUsersResponse | undefined;
  error: Error | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<AuthUsersResponse>;
  paginatedOptions: {
    value: string;
    label: string;
    user: AuthUserResponse;
  }[];
}

// Cache key generator
const getCacheKey = (search: string, page: number, limit: number) =>
  `domain-users-${search || "all"}-page-${page}-limit-${limit}`;

// SWR fetcher function using apiClient (calls Next.js API routes)
const fetcher = async (url: string) => {
  return apiClient.get<AuthUsersResponse>(url);
};

// LRU Cache for storing fetched pages
class LRUCache<T> {
  private cache = new Map<string, { data: T; timestamp: number }>();
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds

  constructor(maxSize: number = 50, ttl: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    // Check if item is expired
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (mark as recently used)
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.data;
  }

  set(key: string, data: T): void {
    // If key exists, delete it first
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // If at max size, delete oldest item
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

const pageCache = new LRUCache<AuthUsersResponse>();

/**
 * Hook for fetching and caching domain users with pagination and search
 * Uses SWR for data fetching and LRU cache for page storage
 */
export function useAuthUsers(
  params: UseAuthUsersParams = {},
  swrOptions: SWRConfiguration = {}
): UseAuthUsersReturn {
  const { search = "", page = 1, limit = 50, enabled = true } = params;

  const cacheKey = getCacheKey(search, page, limit);

  // Check cache first
  const cachedData = pageCache.get(cacheKey);

  const swrResponse: SWRResponse<AuthUsersResponse, Error> = useSWR(
    enabled ? cacheKey : null,
    () => fetcher(`/api/setting/users/domain-users/search?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}`),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 1000,
      ...swrOptions,
    }
  );

  // If we have cached data and SWR hasn't fetched yet, use it
  const data = swrResponse.data || cachedData || undefined;

  // Helper function to convert users to options for Select
  // Map to AuthUserResponse type for compatibility
  const paginatedOptions = data?.users.map((user) => ({
    value: user.username,
    label: `${user.fullName || user.username}${user.title ? ` (${user.title})` : ""}`,
    user: {
      id: String(user.id),
      username: user.username,
      fullName: user.fullName,
      title: user.title,
      email: user.email,
      isTechnician: false,
      isOnline: false,
      isActive: true,
      isSuperAdmin: false,
      isDomain: true,
      isBlocked: false,
    } as AuthUserResponse,
  })) || [];

  return {
    data,
    error: swrResponse.error,
    isLoading: swrResponse.isLoading,
    isValidating: swrResponse.isValidating,
    mutate: (newData) => {
      // Invalidate cache for this key
      if (newData) {
        pageCache.set(cacheKey, newData as AuthUsersResponse);
      }
      return swrResponse.mutate(newData);
    },
    paginatedOptions,
  };
}

/**
 * Hook for prefetching domain user pages
 * Useful for prefetching next/previous pages
 */
export function usePrefetchAuthUsers() {
  const prefetch = async (search: string, page: number, limit: number = 50) => {
    const cacheKey = getCacheKey(search, page, limit);

    // Check if already cached
    if (pageCache.get(cacheKey)) {
      return;
    }

    // Prefetch by calling fetcher directly and caching the result
    try {
      const data = await fetcher(`/api/setting/users/domain-users/search?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}`);
      pageCache.set(cacheKey, data);
    } catch (error) {
      console.error('Failed to prefetch auth users:', error);
    }
  };

  return { prefetch };
}

/**
 * Hook for getting total count of domain users
 * This can be used to show total results
 */
export function useAuthUsersCount(search: string = "", enabled: boolean = true) {
  const { data } = useSWR(
    enabled ? `domain-users-count-${search}` : null,
    async () => {
      const response = await fetcher(
        `/api/setting/users/domain-users/search?search=${encodeURIComponent(search)}&page=1&limit=1`
      );
      return response.total;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 10000,
    }
  );

  return data || 0;
}

/**
 * Hook for clearing the domain users cache
 * Useful when you need to force refresh all cached data
 */
export function useClearAuthUsersCache() {
  const clearCache = () => {
    pageCache.clear();
  };

  return { clearCache };
}
