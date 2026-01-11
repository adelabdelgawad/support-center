/**
 * API route for updating and deleting request notes
 * PATCH /api/requests-details/notes/[noteId] - Update note
 * DELETE /api/requests-details/notes/[noteId] - Delete note
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError, validationError } from '@/lib/api/route-error-handler';
import type { RequestNote } from '@/types/metadata';

type RouteContext = { params: Promise<{ noteId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { noteId } = await context.params;
    const body = await request.json();
    const { note } = body;

    if (!note) {
      return validationError('note', 'Note content is required');
    }

    const updatedNote = await makeAuthenticatedRequest<RequestNote>(
      'PATCH',
      `/request-notes/${noteId}`,
      { note }
    );

    return NextResponse.json(updatedNote);
  } catch (error) {
    return handleRouteError(error, 'Update Note');
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { noteId } = await context.params;

    await makeAuthenticatedRequest('DELETE', `/request-notes/${noteId}`);

    return NextResponse.json({ message: 'Note deleted successfully' });
  } catch (error) {
    return handleRouteError(error, 'Delete Note');
  }
}
