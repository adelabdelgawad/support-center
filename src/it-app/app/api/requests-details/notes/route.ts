/**
 * API route for creating request notes
 * POST /api/requests-details/notes
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError, validationError } from '@/lib/api/route-error-handler';
import type { RequestNote } from '@/types/metadata';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, note } = body;

    if (!requestId) {
      return validationError('requestId', 'Request ID is required');
    }
    if (!note) {
      return validationError('note', 'Note content is required');
    }

    // Call backend to create note
    const newNote = await makeAuthenticatedRequest<RequestNote>(
      'POST',
      `/request-notes/${requestId}/notes`,
      { note }
    );

    return NextResponse.json(newNote, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Create Note');
  }
}
