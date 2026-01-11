/**
 * Client API for version management
 * Calls Next.js API routes (never backend directly)
 */

import type {
  ClientVersion,
  ClientVersionCreate,
  ClientVersionUpdate,
  ClientVersionListResponse,
} from "@/types/client-versions";

const API_BASE = "/api/setting/client-versions";

/**
 * Fetch all client versions
 */
export async function getClientVersions(options?: {
  platform?: string;
  activeOnly?: boolean;
}): Promise<ClientVersionListResponse> {
  const params = new URLSearchParams();
  if (options?.platform) params.set("platform", options.platform);
  if (options?.activeOnly !== undefined) params.set("active_only", options.activeOnly.toString());

  const response = await fetch(`${API_BASE}?${params.toString()}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to fetch versions");
  }

  return response.json();
}

/**
 * Get a single client version
 */
export async function getClientVersion(id: number): Promise<ClientVersion> {
  const response = await fetch(`${API_BASE}/${id}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to fetch version");
  }

  return response.json();
}

/**
 * Create a new client version
 */
export async function createClientVersion(data: ClientVersionCreate): Promise<ClientVersion> {
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to create version");
  }

  return response.json();
}

/**
 * Update a client version
 */
export async function updateClientVersion(
  id: number,
  data: ClientVersionUpdate
): Promise<ClientVersion> {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to update version");
  }

  return response.json();
}

/**
 * Set a version as the latest for its platform
 */
export async function setVersionAsLatest(id: number): Promise<ClientVersion> {
  const response = await fetch(`${API_BASE}/${id}?action=set-latest`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to set as latest");
  }

  return response.json();
}

/**
 * Toggle enforcement on a version
 */
export async function toggleVersionEnforcement(
  id: number,
  isEnforced: boolean
): Promise<ClientVersion> {
  return updateClientVersion(id, { isEnforced });
}

/**
 * Delete (soft) a client version
 */
export async function deleteClientVersion(
  id: number,
  hardDelete: boolean = false
): Promise<void> {
  const response = await fetch(`${API_BASE}/${id}?hard_delete=${hardDelete}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok && response.status !== 204) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to delete version");
  }
}

/**
 * Upload installer file for a client version
 *
 * Uploads the file to MinIO via the backend and updates the version record.
 * Returns the updated version with installer_url pointing to the download endpoint.
 */
export async function uploadInstaller(
  versionId: number,
  file: File
): Promise<ClientVersion> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/${versionId}/installer`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to upload installer");
  }

  return response.json();
}
