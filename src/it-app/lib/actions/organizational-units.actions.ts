"use server";

import { serverFetch, CACHE_PRESETS } from "@/lib/api/server-fetch";

/**
 * Organizational Unit Types
 */
export interface OrganizationalUnit {
  id: number;
  ouName: string;
  ouDn: string | null;
  isEnabled: boolean;
  description: string | null;
  userCount: number;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationalUnitListResponse {
  organizationalUnits: OrganizationalUnit[];
  total: number;
  enabledCount: number;
  disabledCount: number;
}

export interface DiscoverOUResponse {
  ouName: string;
  ouDn: string;
  alreadyExists: boolean;
}

export interface CreateOURequest {
  ouName: string;
  ouDn?: string;
  isEnabled?: boolean;
  description?: string;
}

export interface UpdateOURequest {
  ouName?: string;
  ouDn?: string;
  isEnabled?: boolean;
  description?: string;
}

/**
 * Fetches all organizational units with statistics
 *
 * Cache: NO_CACHE (requires fresh data for sync status)
 */
export async function getOrganizationalUnits(): Promise<OrganizationalUnitListResponse> {
  return await serverFetch<OrganizationalUnitListResponse>(
    "/organizational-units",
    {
      method: "GET",
      ...CACHE_PRESETS.NO_CACHE(),
    }
  );
}

/**
 * Discovers organizational units from Active Directory
 *
 * Cache: NO_CACHE (real-time AD query)
 */
export async function discoverOUsFromAD(): Promise<DiscoverOUResponse[]> {
  return await serverFetch<DiscoverOUResponse[]>(
    "/organizational-units/discover",
    {
      method: "GET",
      ...CACHE_PRESETS.NO_CACHE(),
    }
  );
}

/**
 * Creates a new organizational unit
 */
export async function createOrganizationalUnit(
  data: CreateOURequest
): Promise<OrganizationalUnit> {
  return await serverFetch<OrganizationalUnit>("/organizational-units", {
    method: "POST",
    body: data,
    ...CACHE_PRESETS.NO_CACHE(),
  });
}

/**
 * Updates an organizational unit
 */
export async function updateOrganizationalUnit(
  ouId: number,
  data: UpdateOURequest
): Promise<OrganizationalUnit> {
  return await serverFetch<OrganizationalUnit>(
    `/organizational-units/${ouId}`,
    {
      method: "PATCH",
      body: data,
      ...CACHE_PRESETS.NO_CACHE(),
    }
  );
}

/**
 * Toggles organizational unit enabled status
 */
export async function toggleOUEnabled(
  ouId: number,
  isEnabled: boolean
): Promise<OrganizationalUnit> {
  return await serverFetch<OrganizationalUnit>(
    `/organizational-units/${ouId}/toggle`,
    {
      method: "POST",
      body: { isEnabled },
      ...CACHE_PRESETS.NO_CACHE(),
    }
  );
}

/**
 * Deletes an organizational unit
 */
export async function deleteOrganizationalUnit(ouId: number): Promise<void> {
  return await serverFetch<void>(`/organizational-units/${ouId}`, {
    method: "DELETE",
    ...CACHE_PRESETS.NO_CACHE(),
  });
}
