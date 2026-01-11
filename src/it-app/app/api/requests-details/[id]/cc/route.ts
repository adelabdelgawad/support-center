/**
 * API route for request CC (Carbon Copy) management
 * GET /api/requests-details/[id]/cc - Get CC list (assign_type_id=2)
 * POST /api/requests-details/[id]/cc - Add a CC (assign_type_id=2)
 * DELETE /api/requests-details/[id]/cc - Remove a CC (assign_type_id=2)
 *
 * This route is specific to CC (type ID = 2).
 * For a unified assignment function, use /api/requests-details/[id]/assignments
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError, validationError } from '@/lib/api/route-error-handler';

type RouteContext = { params: Promise<{ id: string }> };

const ASSIGN_TYPE_ID = 2; // CC (Carbon Copy)

interface AssigneesResponse {
  requestId: string;
  assignees: Record<string, unknown>[];
  total: number;
}

/**
 * GET - Fetch CC list for a request
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id: requestId } = await context.params;

    // Backend returns { requestId, assignees, total }
    const response = await makeAuthenticatedRequest<AssigneesResponse>(
      'GET',
      `/requests/${requestId}/assignees?assign_type_id=${ASSIGN_TYPE_ID}`
    );

    // Return with 'ccList' key for the hook
    return NextResponse.json({
      requestId,
      ccList: response?.assignees || [],
      total: response?.total || 0,
    });
  } catch (error) {
    return handleRouteError(error, 'Get CC List');
  }
}

/**
 * POST - Add a CC to request
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: requestId } = await context.params;
    const body = await request.json();
    const { technicianId } = body;

    if (!technicianId) {
      return validationError('technicianId', 'Technician ID is required');
    }

    // Call backend to add CC (send snake_case with assign_type_id=2)
    const response = await makeAuthenticatedRequest<Record<string, unknown>>(
      'POST',
      `/requests/${requestId}/assign`,
      {
        technician_id: technicianId,
        assign_type_id: ASSIGN_TYPE_ID,
      }
    );

    // Transform backend response (snake_case) to frontend format (camelCase)
    const transformedData = response ? {
      id: response.id,
      userId: response.user_id,
      username: response.username,
      fullName: response.full_name,
      title: response.title,
      assignTypeId: response.assign_type_id,
      assignedBy: response.assigned_by,
      assignedByName: response.assigned_by_name,
      createdAt: response.created_at,
    } : null;

    return NextResponse.json({
      success: true,
      message: 'CC added successfully',
      data: transformedData,
    });
  } catch (error) {
    return handleRouteError(error, 'Add CC');
  }
}

/**
 * DELETE - Remove a CC from request
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: requestId } = await context.params;
    const body = await request.json();
    const { technicianId } = body;

    if (!technicianId) {
      return validationError('technicianId', 'Technician ID is required');
    }

    // Call backend to remove CC (send snake_case with assign_type_id=2)
    await makeAuthenticatedRequest(
      'POST',
      `/requests/${requestId}/unassign`,
      {
        technician_id: technicianId,
        assign_type_id: ASSIGN_TYPE_ID,
      }
    );

    return NextResponse.json({
      success: true,
      message: 'CC removed successfully',
    });
  } catch (error) {
    return handleRouteError(error, 'Remove CC');
  }
}
