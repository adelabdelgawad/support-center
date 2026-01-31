/**
 * Email Configuration Types
 *
 * Database-backed SMTP configuration for sending emails.
 */

export interface EmailConfig {
  id: string;
  name: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  smtpTls: boolean;
  isActive: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmailConfigRequest {
  name: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  password: string;
  smtpTls: boolean;
  isActive: boolean;
}

export interface UpdateEmailConfigRequest {
  name?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpFrom?: string;
  password?: string; // Optional - only include if changing password
  smtpTls?: boolean;
  isActive?: boolean;
}

export interface EmailConfigListResponse {
  items: EmailConfig[];
  total: number;
}

export interface TestEmailRequest {
  recipient: string;
}

export interface TestEmailResult {
  success: boolean;
  message: string;
  details?: string;
}
