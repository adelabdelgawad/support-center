/**
 * API route for updating request category/subcategory
 * PATCH /api/requests-details/[id]/category - Update category/subcategory
 *
 * Body:
 * - subcategoryId: number (required) - The new subcategory ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError, validationError } from '@/lib/api/route-error-handler';

type RouteContext = { params: Promise<{ id: string }> };

interface UpdateRequestResponse {
  id: string;
  subcategoryId: number | null;
  [key: string]: unknown;
}

/**
 * PATCH - Update request category/subcategory
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: requestId } = await context.params;
    const body = await request.json();
    const { subcategoryId } = body;

    if (subcategoryId === undefined || subcategoryId === null) {
      return validationError('subcategoryId', 'Subcategory ID is required');
    }

    // Call backend to update request subcategory
    const response = await makeAuthenticatedRequest<UpdateRequestResponse>(
      'PATCH',
      `/requests/${requestId}`,
      {
        subcategory_id: subcategoryId,
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Category updated successfully',
      data: response,
    });
  } catch (error) {
    return handleRouteError(error, 'Update Request Category');
  }
}
