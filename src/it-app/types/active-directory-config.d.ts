/**
 * Active Directory Configuration types
 */

export interface ActiveDirectoryConfig {
  id: string;
  name: string;
  path: string;
  domainName: string;
  port: number;
  useSsl: boolean;
  ldapUsername: string;
  baseDn: string;
  organizationalUnits: string[];
  isActive: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateActiveDirectoryConfigRequest {
  name: string;
  path: string;
  domainName: string;
  port: number;
  useSsl: boolean;
  ldapUsername: string;
  password: string;
  baseDn: string;
  isActive: boolean;
}

export interface UpdateActiveDirectoryConfigRequest {
  name?: string;
  path?: string;
  domainName?: string;
  port?: number;
  useSsl?: boolean;
  ldapUsername?: string;
  password?: string; // Only include if changing password
  baseDn?: string;
  isActive?: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  details?: string;
}

export interface ActiveDirectoryConfigListResponse {
  items: ActiveDirectoryConfig[];
  total: number;
}
