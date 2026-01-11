'use client';

/**
 * Client-side API functions for request details page
 * These functions call internal Next.js API routes (not backend directly)
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';
import type {
  RequestNote,
  CreateNotePayload,
  UpdateNotePayload,
  UpdateTicketStatusPayload,
  UpdateTicketPriorityPayload,
  SendMessagePayload,
} from '@/types/requests-details';

/**
 * Create a new note for a request
 */
export async function createNote(
  requestId: string,
  payload: CreateNotePayload
): Promise<RequestNote> {
  try {
    return await apiClient.post<RequestNote>('/api/requests-details/notes', {
      requestId,
      note: payload.note,
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Update an existing note
 */
export async function updateNote(
  noteId: string,
  payload: UpdateNotePayload
): Promise<RequestNote> {
  try {
    return await apiClient.patch<RequestNote>(
      `/api/requests-details/notes/${noteId}`,
      payload
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Delete a note
 */
export async function deleteNote(noteId: string): Promise<void> {
  try {
    await apiClient.delete(`/api/requests-details/notes/${noteId}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Update request status
 */
export async function updateRequestStatus(
  requestId: string,
  payload: UpdateTicketStatusPayload
): Promise<unknown> {
  try {
    return await apiClient.patch(
      `/api/requests-details/${requestId}/status`,
      payload
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Update request priority
 */
export async function updateRequestPriority(
  requestId: string,
  payload: UpdateTicketPriorityPayload
): Promise<unknown> {
  try {
    return await apiClient.patch(
      `/api/requests-details/${requestId}/priority`,
      payload
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Assign a technician to a request
 */
export async function assignTechnician(
  requestId: string,
  technicianId: number
): Promise<unknown> {
  try {
    return await apiClient.post(
      `/api/requests-details/${requestId}/assign`,
      { technicianId }
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Unassign a technician from a request
 */
export async function unassignTechnician(
  requestId: string,
  technicianId: number
): Promise<unknown> {
  try {
    return await apiClient.post(
      `/api/requests-details/${requestId}/unassign`,
      { technicianId }
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Send a chat message
 */
export async function sendMessage(payload: SendMessagePayload): Promise<unknown> {
  try {
    return await apiClient.post('/api/chat/messages', {
      request_id: payload.requestId,
      sender_id: payload.senderId,
      content: payload.content,
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Upload attachments for a request
 */
export async function uploadAttachment(
  requestId: string,
  files: File[]
): Promise<unknown[]> {
  const uploadedFiles = [];

  for (const file of files) {
    try {
      const formData = new FormData();
      formData.append('files', file);

      const response = await fetch(
        `/api/chat/attachments/upload?request_id=${requestId}`,
        {
          method: 'POST',
          body: formData,
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to upload ${file.name}`);
      }

      const responseData = await response.json();
      uploadedFiles.push(responseData);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  return uploadedFiles;
}

/**
 * Fetch notes for a request (for SWR fetcher)
 */
export async function fetchNotes(requestId: string): Promise<RequestNote[]> {
  try {
    return await apiClient.get<RequestNote[]>(`/api/request-notes/${requestId}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Take (self-assign) a request - creates UserRequestAssign record
 */
export async function takeRequest(requestId: string): Promise<unknown> {
  try {
    return await apiClient.post(`/api/requests-details/${requestId}/take`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
