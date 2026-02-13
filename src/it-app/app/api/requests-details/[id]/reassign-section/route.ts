/**
 * API route for reassigning request to a different section
 * PATCH /api/requests-details/[id]/reassign-section
 *
 * Body:
 * - sectionId: number (required) - The new section ID
 * - subcategoryId: number (optional) - The new subcategory ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError, validationError } from '@/lib/api/route-error-handler';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH - Reassign request to a different section (and optionally update subcategory)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: requestId } = await context.params;
    const body = await request.json();
    const { sectionId, subcategoryId } = body;

    if (sectionId === undefined || sectionId === null) {
      return validationError('sectionId', 'Section ID is required');
    }

    // Call backend to reassign section
    const sectionResponse = await makeAuthenticatedRequest(
      'PATCH',
      `/requests/${requestId}/reassign-section`,
      { section_id: sectionId }
    );

    // If subcategoryId provided, also update the subcategory
    if (subcategoryId !== undefined && subcategoryId !== null) {
      await makeAuthenticatedRequest(
        'PATCH',
        `/requests/${requestId}`,
        { subcategory_id: subcategoryId }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Section reassigned successfully',
      data: sectionResponse,
    });
  } catch (error) {
    return handleRouteError(error, 'Reassign Request Section');
  }
}
