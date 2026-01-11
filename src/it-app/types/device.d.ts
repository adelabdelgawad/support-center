/**
 * Device types for Deployment Control Plane.
 */

export type DeviceLifecycleState =
  | 'discovered'
  | 'install_pending'
  | 'installed_unenrolled'
  | 'enrolled'
  | 'managed'
  | 'quarantined';

export type DeviceDiscoverySource = 'ad' | 'network_scan' | 'desktop_session' | 'manual';

export interface Device {
  id: string;
  hostname: string;
  ipAddress: string | null;
  macAddress: string | null;
  lifecycleState: DeviceLifecycleState;
  discoverySource: DeviceDiscoverySource;
  adComputerDn: string | null;
  desktopSessionId: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  hasActiveSession: boolean;
}

export interface DeviceListItem {
  id: string;
  hostname: string;
  ipAddress: string | null;
  macAddress: string | null;
  lifecycleState: DeviceLifecycleState;
  discoverySource: DeviceDiscoverySource;
  adComputerDn: string | null;
  lastSeenAt: string | null;
  hasActiveSession: boolean;
  isOnline: boolean;
}

export interface DeviceListResponse {
  devices: DeviceListItem[];
  total: number;
}

export interface DeviceUpdate {
  lifecycleState?: DeviceLifecycleState;
  ipAddress?: string;
  macAddress?: string;
}

// Discovery request types

export interface ADDiscoveryRequest {
  searchBase?: string;
  filterPattern?: string;
}

export interface SubnetScanRequest {
  subnet: string;
  ports?: number[];
}

export interface SessionSyncRequest {
  activeOnly?: boolean;
}

export interface InstallRequest {
  credentialId?: string;
  force?: boolean;
}

// Manual Add request
export interface ManualAddRequest {
  hostname: string;
  ipAddress?: string;
  description?: string;
}

// Network Scan request - supports multiple scan types
export type ScanType = 'single' | 'range' | 'network';

export interface NetworkScanRequest {
  scanType: ScanType;
  // For single IP scan
  ipAddress?: string;
  // For range scan
  startIp?: string;
  endIp?: string;
  // For network scan
  cidr?: string;
}

// Discovery response (for sync-sessions, network-scan)
export interface DiscoveryResponse {
  createdCount: number;
  updatedCount: number;
  totalCount: number;
  devices: DeviceListItem[];
  // Network scan metadata (only populated for network scans)
  hostsScanned?: number;
  hostsReachable?: number;
  hostsDeployable?: number;
}

// Count response
export interface DeviceCountResponse {
  count: number;
}
