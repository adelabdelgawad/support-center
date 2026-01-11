'use client';

import useSWR from 'swr';
import { apiClient } from '@/lib/fetch/client';
import type { RequestNote } from '@/types/metadata';

/**
 * Fetcher function for SWR using apiClient
 */
async function fetcher<T>(url: string): Promise<T> {
  return apiClient.get<T>(url);
}

/**
 * Hook to fetch and manage request notes using SWR
 * Updates cache directly from server response (no extra network requests)
 *
 * @param requestId - The request/ticket ID
 * @param initialData - Initial notes data from server (for SSR)
 * @returns SWR response with notes data and helpers
 */
export function useRequestNotes(requestId: string, initialData?: RequestNote[]) {
  // Check if initial data is empty - if so, we need to fetch on mount
  const hasRealInitialData = initialData && initialData.length > 0;

  const { data, error, isLoading, mutate } = useSWR<RequestNote[]>(
    requestId ? `/api/request-notes/${requestId}` : null,
    fetcher,
    {
      fallbackData: initialData,
      // Fetch on mount if no real initial data (e.g., came from empty fallback)
      revalidateOnMount: !hasRealInitialData,
      revalidateOnFocus: false, // Don't refetch when window regains focus
      revalidateOnReconnect: true, // Refetch when network reconnects
    }
  );

  // Current notes - either from SWR data or fallback to initialData
  const notes = data ?? initialData ?? [];

  /**
   * Enhanced loading state that considers SSR data
   * SWR's isLoading is true when no data and request is in flight
   * But when fallbackData is provided, isLoading should be false
   */
  const notesLoading = data === undefined && initialData === undefined ? isLoading : false;

  /**
   * Add a new note - uses server response to update cache directly
   * Flow: POST request → Get new note from response → Add to cache
   */
  const addNote = async (noteText: string): Promise<RequestNote> => {
    // Store previous data for rollback
    const previousNotes = notes;

    try {
      // Send request to server and get the created note back
      const newNote = await apiClient.post<RequestNote>('/api/request-notes', {
        requestId,
        note: noteText,
      });

      // Update cache directly using the response data (no revalidation needed)
      // Add new note at the beginning (top of list)
      await mutate(
        [newNote, ...notes],
        { revalidate: false }
      );

      return newNote;
    } catch (error) {
      // Rollback is automatic since we didn't mutate, but log for debugging
      console.error('Failed to add note:', error);
      throw error;
    }
  };

  return {
    notes,
    isLoading: notesLoading,
    error,
    addNote,
    mutate,
  };
}
