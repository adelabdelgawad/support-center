/**
 * DeploymentJob types for Deployment Control Plane.
 */

export type DeploymentJobStatus = 'queued' | 'in_progress' | 'done' | 'failed';

export interface DeploymentJob {
  id: string;
  jobType: string;
  status: DeploymentJobStatus;
  payload: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
}

export interface DeploymentJobListItem {
  id: string;
  jobType: string;
  status: DeploymentJobStatus;
  payload: Record<string, unknown>;
  createdAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface DeploymentJobListResponse {
  jobs: DeploymentJobListItem[];
  total: number;
}

export interface DeploymentJobCreate {
  jobType: string;
  payload: Record<string, unknown>;
}

// Count response
export interface DeploymentJobCountResponse {
  count: number;
}

// Payload types for NetSupport installation

export interface TargetDevice {
  deviceId: string;
  hostname: string;
  ip: string | null;
}

export interface InstallerInfo {
  url: string;
  silentArgs: string;
}

export interface DeploymentConstraints {
  timeoutMinutes: number;
  maxParallel: number;
}

export interface NetSupportInstallPayload {
  targets: TargetDevice[];
  installer: InstallerInfo;
  credentialRef: string | null;
  constraints: DeploymentConstraints;
}
