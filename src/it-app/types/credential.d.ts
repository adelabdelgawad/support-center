/**
 * Credential types for Deployment Control Plane.
 */

export type CredentialType = 'local_admin' | 'domain_admin';

export interface Credential {
  id: string;
  name: string;
  credentialType: CredentialType;
  scope: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  createdBy: string | null;
}

export interface CredentialListItem {
  id: string;
  name: string;
  credentialType: CredentialType;
  scope: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CredentialListResponse {
  credentials: CredentialListItem[];
  total: number;
}

export interface CredentialCreate {
  name: string;
  credentialType: CredentialType;
  scope?: Record<string, unknown>;
  vaultRef?: string;
}

export interface CredentialUpdate {
  name?: string;
  scope?: Record<string, unknown>;
  vaultRef?: string;
  enabled?: boolean;
}

// Count response
export interface CredentialCountResponse {
  count: number;
}

/**
 * Inline credentials for per-task installation (not stored).
 */
export interface InstallCredentials {
  username: string;
  password: string;
  credentialType: CredentialType;
}

/**
 * Request payload for triggering device installation.
 */
export interface InstallRequest {
  credentials: InstallCredentials;
  force?: boolean;
}
