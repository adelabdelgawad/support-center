"use server";

import { serverGet, serverPost, serverPatch, serverDelete } from "@/lib/fetch/server";

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
  return await serverGet<OrganizationalUnitListResponse>(
    "/organizational-units",
    { revalidate: 0 }
  );
}

/**
 * Discovers organizational units from Active Directory
 *
 * Cache: NO_CACHE (real-time AD query)
 */
export async function discoverOUsFromAD(): Promise<DiscoverOUResponse[]> {
  return await serverGet<DiscoverOUResponse[]>(
    "/organizational-units/discover",
    { revalidate: 0 }
  );
}

/**
 * Creates a new organizational unit
 */
export async function createOrganizationalUnit(
  data: CreateOURequest
): Promise<OrganizationalUnit> {
  return await serverPost<OrganizationalUnit>("/organizational-units", data);
}

/**
 * Updates an organizational unit
 */
export async function updateOrganizationalUnit(
  ouId: number,
  data: UpdateOURequest
): Promise<OrganizationalUnit> {
  return await serverPatch<OrganizationalUnit>(
    `/organizational-units/${ouId}`,
    data
  );
}

/**
 * Toggles organizational unit enabled status
 */
export async function toggleOUEnabled(
  ouId: number,
  isEnabled: boolean
): Promise<OrganizationalUnit> {
  return await serverPost<OrganizationalUnit>(
    `/organizational-units/${ouId}/toggle`,
    { isEnabled }
  );
}

/**
 * Deletes an organizational unit
 */
export async function deleteOrganizationalUnit(ouId: number): Promise<void> {
  return await serverDelete(`/organizational-units/${ouId}`);
}

/**
 * Bulk sync organizational units (add new, remove deselected)
 */
export interface SyncOUsRequest {
  added: { ouName: string; ouDn: string }[];
  removed: string[]; // ou_name values
}

export interface SyncOUsResponse {
  createdCount: number;
  deletedCount: number;
}

export async function syncOrganizationalUnits(
  data: SyncOUsRequest
): Promise<SyncOUsResponse> {
  return await serverPost<SyncOUsResponse>("/organizational-units/sync", data);
}
