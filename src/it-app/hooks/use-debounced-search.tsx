 
"use client";

import { useEffect, useState } from "react";

/**
 * Custom hook for debouncing search input
 * @param value - The input value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns Debounced value
 */
export function useDebouncedSearch<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Custom hook for managing debounced search with state
 * @param initialValue - Initial search value
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns [searchValue, setSearchValue, debouncedValue]
 */
export function useDebouncedState(
  initialValue: string = "",
  delay: number = 300
): [string, (value: string) => void, string] {
  const [searchValue, setSearchValue] = useState(initialValue);
  const debouncedValue = useDebouncedSearch(searchValue, delay);

  return [searchValue, setSearchValue, debouncedValue];
}
