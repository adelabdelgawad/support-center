/**
 * Unified API route for request assignments management
 *
 * This route handles all assignment types through a single endpoint:
 * - GET /api/requests-details/[id]/assignments?type=1|2 - Get assignments by type
 * - POST /api/requests-details/[id]/assignments - Add an assignment
 * - DELETE /api/requests-details/[id]/assignments - Remove an assignment
 *
 * Assignment Types (from AssignType enum):
 * - 1 = TECHNICIAN (Assignee)
 * - 2 = CC (Carbon Copy)
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError, validationError } from '@/lib/api/route-error-handler';
import { AssignType, type AssignTypeValue } from '@/lib/types/enums';

type RouteContext = { params: Promise<{ id: string }> };

/** Valid assignment type IDs (using shared enum) */
const ASSIGNMENT_TYPES = AssignType;

type AssignmentTypeId = AssignTypeValue;

/** Labels for assignment types (used in error messages and responses) */
const ASSIGNMENT_TYPE_LABELS: Record<AssignmentTypeId, string> = {
  [ASSIGNMENT_TYPES.TECHNICIAN]: 'Assignee',
  [ASSIGNMENT_TYPES.CC]: 'CC',
};

interface AssigneesResponse {
  requestId: string;
  assignees: Record<string, unknown>[];
  total: number;
}

interface AssignmentMember {
  id: number;
  userId: number;
  username: string;
  fullName: string | null;
  title: string | null;
  assignTypeId: number;
  assignedBy: number | null;
  assignedByName: string | null;
  createdAt: string;
}

/**
 * Validates and parses the assignment type ID from the request
 */
function parseAssignTypeId(typeParam: string | null): AssignmentTypeId | null {
  if (!typeParam) return null;
  const typeId = parseInt(typeParam, 10);
  if (typeId === ASSIGNMENT_TYPES.TECHNICIAN || typeId === ASSIGNMENT_TYPES.CC) {
    return typeId;
  }
  return null;
}

/**
 * Transforms backend snake_case response to frontend camelCase
 */
function transformAssignmentData(data: Record<string, unknown>): AssignmentMember {
  return {
    id: data.id as number,
    userId: data.user_id as number,
    username: data.username as string,
    fullName: data.full_name as string | null,
    title: data.title as string | null,
    assignTypeId: data.assign_type_id as number,
    assignedBy: data.assigned_by as number | null,
    assignedByName: data.assigned_by_name as string | null,
    createdAt: data.created_at as string,
  };
}

/**
 * GET - Fetch assignments by type for a request
 * Query params:
 * - type: 1 (Assignee) or 2 (CC) - required
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: requestId } = await context.params;
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type');

    const assignTypeId = parseAssignTypeId(typeParam);
    if (!assignTypeId) {
      return validationError('type', 'Assignment type must be 1 (Assignee) or 2 (CC)');
    }

    const typeLabel = ASSIGNMENT_TYPE_LABELS[assignTypeId];

    // Backend returns { requestId, assignees, total }
    const response = await makeAuthenticatedRequest<AssigneesResponse>(
      'GET',
      `/requests/${requestId}/assignees?assign_type_id=${assignTypeId}`
    );

    // Return with appropriate key based on type
    const listKey = assignTypeId === ASSIGNMENT_TYPES.TECHNICIAN ? 'assignees' : 'ccList';

    return NextResponse.json({
      requestId,
      [listKey]: response?.assignees || [],
      total: response?.total || 0,
      assignTypeId,
      typeLabel,
    });
  } catch (error) {
    return handleRouteError(error, 'Get Assignments');
  }
}

/**
 * POST - Add an assignment to request
 * Body:
 * - technicianId: number - required
 * - assignTypeId: 1 (Assignee) or 2 (CC) - required
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: requestId } = await context.params;
    const body = await request.json();
    const { technicianId, assignTypeId } = body;

    if (!technicianId) {
      return validationError('technicianId', 'Technician ID is required');
    }

    const parsedTypeId = assignTypeId as AssignmentTypeId;
    if (parsedTypeId !== ASSIGNMENT_TYPES.TECHNICIAN && parsedTypeId !== ASSIGNMENT_TYPES.CC) {
      return validationError('assignTypeId', 'Assignment type must be 1 (Assignee) or 2 (CC)');
    }

    const typeLabel = ASSIGNMENT_TYPE_LABELS[parsedTypeId];

    // Call backend to add assignment
    const response = await makeAuthenticatedRequest<Record<string, unknown>>(
      'POST',
      `/requests/${requestId}/assign`,
      {
        technician_id: technicianId,
        assign_type_id: parsedTypeId,
      }
    );

    // Transform response to camelCase
    const transformedData = response ? transformAssignmentData(response) : null;

    return NextResponse.json({
      success: true,
      message: `${typeLabel} added successfully`,
      data: transformedData,
    });
  } catch (error) {
    return handleRouteError(error, 'Add Assignment');
  }
}

/**
 * DELETE - Remove an assignment from request
 * Body:
 * - technicianId: number - required
 * - assignTypeId: 1 (Assignee) or 2 (CC) - required
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: requestId } = await context.params;
    const body = await request.json();
    const { technicianId, assignTypeId } = body;

    if (!technicianId) {
      return validationError('technicianId', 'Technician ID is required');
    }

    const parsedTypeId = assignTypeId as AssignmentTypeId;
    if (parsedTypeId !== ASSIGNMENT_TYPES.TECHNICIAN && parsedTypeId !== ASSIGNMENT_TYPES.CC) {
      return validationError('assignTypeId', 'Assignment type must be 1 (Assignee) or 2 (CC)');
    }

    const typeLabel = ASSIGNMENT_TYPE_LABELS[parsedTypeId];

    // Call backend to remove assignment
    await makeAuthenticatedRequest(
      'POST',
      `/requests/${requestId}/unassign`,
      {
        technician_id: technicianId,
        assign_type_id: parsedTypeId,
      }
    );

    return NextResponse.json({
      success: true,
      message: `${typeLabel} removed successfully`,
    });
  } catch (error) {
    return handleRouteError(error, 'Remove Assignment');
  }
}
