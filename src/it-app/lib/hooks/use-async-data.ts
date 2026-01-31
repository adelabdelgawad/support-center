'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * A minimal async data fetching hook
 * Replaces SWR for pages that don't need polling, revalidation, or cache sharing
 *
 * @param fetchFn - Async function that returns data
 * @param deps - Dependency array for refetching
 * @param initialData - Optional initial data (from SSR)
 * @returns { data, isLoading, error, refetch }
 */
export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  deps: React.DependencyList = [],
  initialData?: T
) {
  const [data, setData] = useState<T | undefined>(initialData);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<Error | null>(null);

  // Use a ref to track if component is mounted
  const isMountedRef = useRef(true);
  const lastDepsRef = useRef<React.DependencyList>(initialData ? deps : []);
  const fetchFnRef = useRef(fetchFn);

  // Keep fetchFn ref up to date
  fetchFnRef.current = fetchFn;

  // Stable fetch function that doesn't depend on fetchFn identity
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchFnRef.current();
      if (isMountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Deep compare function for dependency checking
  const depsEqual = (deps1: React.DependencyList, deps2: React.DependencyList): boolean => {
    if (deps1.length !== deps2.length) return false;

    for (let i = 0; i < deps1.length; i++) {
      const dep1 = deps1[i];
      const dep2 = deps2[i];

      // Primitive comparison
      if (dep1 === dep2) continue;

      // Handle null/undefined
      if (dep1 == null || dep2 == null) {
        if (dep1 !== dep2) return false;
        continue;
      }

      // Object/array comparison - use JSON.stringify for deep comparison
      if (typeof dep1 === 'object' && typeof dep2 === 'object') {
        if (JSON.stringify(dep1) !== JSON.stringify(dep2)) return false;
      } else {
        // Different types or non-matching primitives
        return false;
      }
    }

    return true;
  };

  // Fetch on mount and when dependencies change
  const depsKey = JSON.stringify(deps);
  useEffect(() => {
    // Skip initial fetch if we have initialData and deps haven't changed
    if (initialData && depsEqual(deps, lastDepsRef.current)) {
      lastDepsRef.current = deps;
      return;
    }
    lastDepsRef.current = deps;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Manual refetch function
  const refetch = useCallback(() => {
    return fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch,
  };
}
