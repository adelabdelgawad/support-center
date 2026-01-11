/**
 * API route for request assignees (Technicians) management
 * GET /api/requests-details/[id]/assignees - Get assignees list (assign_type_id=1)
 * POST /api/requests-details/[id]/assignees - Add an assignee (assign_type_id=1)
 * DELETE /api/requests-details/[id]/assignees - Remove an assignee (assign_type_id=1)
 *
 * This route is specific to Assignees (type ID = 1).
 * For a unified assignment function, use /api/requests-details/[id]/assignments
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError, validationError } from '@/lib/api/route-error-handler';

type RouteContext = { params: Promise<{ id: string }> };

const ASSIGN_TYPE_ID = 1; // Assignee (Technician)

interface AssigneesResponse {
  requestId: string;
  assignees: Record<string, unknown>[];
  total: number;
}

/**
 * GET - Fetch assignees list for a request
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Backend returns { requestId, assignees, total }
    const response = await makeAuthenticatedRequest<AssigneesResponse>(
      'GET',
      `/requests/${id}/assignees?assign_type_id=${ASSIGN_TYPE_ID}`
    );

    // Return the full response object (SWR hook expects this structure)
    return NextResponse.json({
      requestId: id,
      assignees: response?.assignees || [],
      total: response?.total || 0,
    });
  } catch (error) {
    return handleRouteError(error, 'Fetch Assignees');
  }
}

/**
 * Backend returns full ServiceRequestRead with assignees array
 */
interface ServiceRequestResponse {
  id: string;
  assignees?: Array<{
    id: number;
    user_id?: number;
    userId?: number;
    username?: string;
    full_name?: string;
    fullName?: string;
    title?: string;
    assign_type_id?: number;
    assignTypeId?: number;
    assigned_by?: number;
    assignedBy?: number;
    assigned_by_name?: string;
    assignedByName?: string;
    created_at?: string;
    createdAt?: string;
  }>;
}

/**
 * POST - Add an assignee to request
 * Returns the full updated assignees list for direct cache replacement
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: requestId } = await context.params;
    const body = await request.json();
    const { technicianId } = body;

    if (!technicianId) {
      return validationError('technicianId', 'Technician ID is required');
    }

    // Call backend to add assignee (send snake_case with assign_type_id=1)
    // Note: Backend returns ServiceRequestRead which doesn't include assignees
    const assignResponse = await makeAuthenticatedRequest<ServiceRequestResponse>(
      'POST',
      `/requests/${requestId}/assign`,
      {
        technician_id: technicianId,
        assign_type_id: ASSIGN_TYPE_ID,
      }
    );

    // Fetch the updated assignees list after successful assignment
    const assigneesResponse = await makeAuthenticatedRequest<AssigneesResponse>(
      'GET',
      `/requests/${requestId}/assignees?assign_type_id=${ASSIGN_TYPE_ID}`
    );

    // Transform all assignees from backend (snake_case) to frontend format (camelCase)
    const assignees = (assigneesResponse?.assignees || []).map((a) => {
      const assignee = a as Record<string, unknown>;
      return {
        id: assignee.id,
        userId: assignee.user_id ?? assignee.userId,
        username: assignee.username,
        fullName: assignee.full_name ?? assignee.fullName,
        title: assignee.title,
        assignTypeId: assignee.assign_type_id ?? assignee.assignTypeId,
        assignedBy: assignee.assigned_by ?? assignee.assignedBy,
        assignedByName: assignee.assigned_by_name ?? assignee.assignedByName,
        createdAt: assignee.created_at ?? assignee.createdAt,
      };
    });

    // Return full assignees list - hook will replace cache directly
    return NextResponse.json({
      success: true,
      message: 'Assignee added successfully',
      requestId,
      assignees,
      total: assignees.length,
    });
  } catch (error) {
    return handleRouteError(error, 'Add Assignee');
  }
}

/**
 * DELETE - Remove an assignee from request
 * Returns the full updated assignees list for direct cache replacement
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: requestId } = await context.params;
    const body = await request.json();
    const { technicianId } = body;

    if (!technicianId) {
      return validationError('technicianId', 'Technician ID is required');
    }

    // Call backend to remove assignee (send snake_case with assign_type_id=1)
    await makeAuthenticatedRequest(
      'POST',
      `/requests/${requestId}/unassign`,
      {
        technician_id: technicianId,
        assign_type_id: ASSIGN_TYPE_ID,
      }
    );

    // Fetch the updated assignees list after successful removal
    const assigneesResponse = await makeAuthenticatedRequest<AssigneesResponse>(
      'GET',
      `/requests/${requestId}/assignees?assign_type_id=${ASSIGN_TYPE_ID}`
    );

    // Transform all assignees from backend (snake_case) to frontend format (camelCase)
    const assignees = (assigneesResponse?.assignees || []).map((a) => {
      const assignee = a as Record<string, unknown>;
      return {
        id: assignee.id,
        userId: assignee.user_id ?? assignee.userId,
        username: assignee.username,
        fullName: assignee.full_name ?? assignee.fullName,
        title: assignee.title,
        assignTypeId: assignee.assign_type_id ?? assignee.assignTypeId,
        assignedBy: assignee.assigned_by ?? assignee.assignedBy,
        assignedByName: assignee.assigned_by_name ?? assignee.assignedByName,
        createdAt: assignee.created_at ?? assignee.createdAt,
      };
    });

    // Return full assignees list - hook will replace cache directly
    return NextResponse.json({
      success: true,
      message: 'Assignee removed successfully',
      requestId,
      assignees,
      total: assignees.length,
    });
  } catch (error) {
    return handleRouteError(error, 'Remove Assignee');
  }
}
