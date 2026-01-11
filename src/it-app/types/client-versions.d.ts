/**
 * Client Version types for Version Authority system
 * Matches backend schemas from src/backend/schemas/version/client_version.py
 *
 * Version Rules:
 * - New versions are ALWAYS set as latest automatically
 * - Version must be valid semantic version (e.g., "1.0.0", "2.1.3-beta")
 * - New version must be greater than current latest
 * - Platform is always "desktop" (single platform)
 * - orderIndex is computed from semantic version (server-managed)
 */

// Client version record (read)
export interface ClientVersion {
  id: number;
  versionString: string;
  platform: 'desktop';  // Always desktop
  orderIndex: number;   // Server-computed from semantic version
  isLatest: boolean;
  isEnforced: boolean;
  isActive: boolean;
  releaseNotes: string | null;
  releasedAt: string | null;
  // Upgrade distribution metadata
  installerUrl: string | null;
  installerObjectKey: string | null;  // MinIO object key when uploaded via MinIO
  silentInstallArgs: string | null;
  createdAt: string;
  updatedAt: string;
}

// List response with stats
export interface ClientVersionListResponse {
  versions: ClientVersion[];
  total: number;
  latestCount: number;
  enforcedCount: number;
}

/**
 * Create payload - simplified
 * Note:
 * - versionString must be valid semantic version (e.g., "1.0.0")
 * - New version MUST be greater than current latest
 * - isLatest is ALWAYS true (auto-set by server)
 * - orderIndex is computed from semantic version
 * - platform is always "desktop"
 * - Installer is uploaded separately via uploadInstaller()
 */
export interface ClientVersionCreate {
  versionString: string;  // Required: semantic version format
  isEnforced?: boolean;   // Optional: enable enforcement on create
  releaseNotes?: string | null;
  releasedAt?: string | null;
  // Silent install args (installer file uploaded separately)
  silentInstallArgs?: string | null;
}

/**
 * Update payload - limited fields
 * Note:
 * - versionString cannot be changed after creation
 * - orderIndex and platform are server-managed
 * - Use set_latest endpoint to change latest status
 * - Installer is uploaded separately via uploadInstaller()
 */
export interface ClientVersionUpdate {
  isEnforced?: boolean;
  isActive?: boolean;
  releaseNotes?: string | null;
  releasedAt?: string | null;
  // Silent install args (installer file uploaded separately)
  silentInstallArgs?: string | null;
}
