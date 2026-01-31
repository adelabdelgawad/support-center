'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/fetch/client';
import type { RequestNote } from '@/types/metadata';

/**
 * Hook to fetch and manage request notes using useState
 * Updates cache directly from server response (no extra network requests)
 *
 * @param requestId - The request/ticket ID
 * @param initialData - Initial notes data from server (for SSR)
 * @returns Response with notes data and helpers
 */
export function useRequestNotes(requestId: string, initialData?: RequestNote[]) {
  // Use useState for notes management
  const [notes, setNotes] = useState<RequestNote[]>(initialData ?? []);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Enhanced loading state that considers SSR data
   * If we have initial data, we're not loading
   */
  const notesLoading = !initialData && isLoading;

  /**
   * Add a new note - uses server response to update state directly
   * Flow: POST request → Get new note from response → Add to state
   */
  const addNote = useCallback(async (noteText: string): Promise<RequestNote> => {
    try {
      // Send request to server and get the created note back
      const newNote = await apiClient.post<RequestNote>('/api/request-notes', {
        requestId,
        note: noteText,
      });

      // Update state directly using the response data (no revalidation needed)
      // Add new note at the beginning (top of list)
      setNotes(prev => [newNote, ...prev]);

      return newNote;
    } catch (error) {
      console.error('Failed to add note:', error);
      throw error;
    }
  }, [requestId]);

  /**
   * Manual mutate function for compatibility
   * Can be called to force a refresh from server
   */
  const mutate = useCallback(async () => {
    if (!requestId) return;
    setIsLoading(true);
    try {
      const fetchedNotes = await apiClient.get<RequestNote[]>(`/api/request-notes/${requestId}`);
      setNotes(fetchedNotes);
    } catch (error) {
      console.error('Failed to fetch notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  return {
    notes,
    isLoading: notesLoading,
    error: undefined,
    addNote,
    mutate,
  };
}
