/**
 * API client for business unit user assignments
 */

export interface BusinessUnitUserAssign {
  id: number;
  userId: string;
  businessUnitId: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface UserBusinessUnit {
  id: number;
  name: string;
  isActive: boolean;
}

export interface BulkAssignRequest {
  userIds: string[];
  businessUnitId: number;
}

export interface BulkRemoveRequest {
  userIds: string[];
  businessUnitId: number;
}

/**
 * Get all business units for a specific user
 */
export async function getUserBusinessUnits(
  userId: string
): Promise<UserBusinessUnit[]> {
  const response = await fetch(
    `/api/setting/business-unit-user-assigns/user/${userId}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to fetch user business units");
  }

  return await response.json();
}

/**
 * Get all users for a specific business unit
 */
export async function getBusinessUnitUsers(
  businessUnitId: number
): Promise<any[]> {
  const response = await fetch(
    `/api/setting/business-unit-user-assigns/business-unit/${businessUnitId}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to fetch business unit users");
  }

  return await response.json();
}

/**
 * Bulk assign users to a business unit
 */
export async function bulkAssignUsers(
  data: BulkAssignRequest
): Promise<{ message: string; created_count: number }> {
  const response = await fetch(
    "/api/setting/business-unit-user-assigns/bulk-assign",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to bulk assign users");
  }

  return await response.json();
}

/**
 * Bulk remove users from a business unit
 */
export async function bulkRemoveUsers(
  data: BulkRemoveRequest
): Promise<{ message: string; deleted_count: number }> {
  const response = await fetch(
    "/api/setting/business-unit-user-assigns/bulk-remove",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to bulk remove users");
  }

  return await response.json();
}
