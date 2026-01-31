"use client";

import { api } from "@/lib/fetch/client";
import type {
  ActiveDirectoryConfig,
  ActiveDirectoryConfigListResponse,
  CreateActiveDirectoryConfigRequest,
  TestConnectionResult,
  UpdateActiveDirectoryConfigRequest,
} from "@/types/active-directory-config";
import type { OUTreeNode } from "@/types/ou-tree";

const BASE_PATH = "/api/management/active-directory-configs";

/**
 * Get all AD configurations
 */
export async function getADConfigs(): Promise<ActiveDirectoryConfigListResponse> {
  return api.get<ActiveDirectoryConfigListResponse>(BASE_PATH);
}

/**
 * Get AD configuration by ID
 */
export async function getADConfigById(
  id: string
): Promise<ActiveDirectoryConfig> {
  return api.get<ActiveDirectoryConfig>(`${BASE_PATH}/${id}`);
}

/**
 * Create new AD configuration
 */
export async function createADConfig(
  data: CreateActiveDirectoryConfigRequest
): Promise<ActiveDirectoryConfig> {
  return api.post<ActiveDirectoryConfig>(BASE_PATH, data);
}

/**
 * Update AD configuration
 */
export async function updateADConfig(
  id: string,
  data: UpdateActiveDirectoryConfigRequest
): Promise<ActiveDirectoryConfig> {
  return api.put<ActiveDirectoryConfig>(`${BASE_PATH}/${id}`, data);
}

/**
 * Delete AD configuration
 */
export async function deleteADConfig(id: string): Promise<void> {
  await api.delete<void>(`${BASE_PATH}/${id}`);
}

/**
 * Test AD connection
 */
export async function testADConnection(
  id: string
): Promise<TestConnectionResult> {
  return api.post<TestConnectionResult>(`${BASE_PATH}/${id}/test`);
}

/**
 * Fetch OU tree for AD configuration
 */
export async function getOUTree(id: string): Promise<OUTreeNode[]> {
  return api.get<OUTreeNode[]>(`${BASE_PATH}/${id}/ou-tree`);
}

/**
 * Update desired OUs for AD configuration
 */
export async function updateDesiredOUs(
  id: string,
  desiredOus: string[]
): Promise<ActiveDirectoryConfig> {
  return api.put<ActiveDirectoryConfig>(`${BASE_PATH}/${id}`, {
    desiredOus,
  });
}
