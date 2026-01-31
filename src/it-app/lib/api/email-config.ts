/**
 * Email Configuration Client API
 *
 * Client-side API functions for email configuration management.
 * All functions call Next.js API routes (NOT backend directly).
 */

import type {
  EmailConfig,
  CreateEmailConfigRequest,
  UpdateEmailConfigRequest,
  EmailConfigListResponse,
  TestEmailRequest,
  TestEmailResult,
} from "@/types/email-config";

/**
 * Get all email configurations
 */
export async function getEmailConfigs(
  skip: number = 0,
  limit: number = 100
): Promise<EmailConfigListResponse> {
  const response = await fetch(
    `/api/management/email-configs?skip=${skip}&limit=${limit}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to fetch email configurations");
  }

  return await response.json();
}

/**
 * Get email configuration by ID
 */
export async function getEmailConfigById(id: string): Promise<EmailConfig> {
  const response = await fetch(`/api/management/email-configs/${id}`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Email configuration not found");
  }

  return await response.json();
}

/**
 * Get the currently active email configuration
 */
export async function getActiveEmailConfig(): Promise<EmailConfig> {
  const response = await fetch("/api/management/email-configs/active", {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "No active email configuration found");
  }

  return await response.json();
}

/**
 * Create a new email configuration
 */
export async function createEmailConfig(
  data: CreateEmailConfigRequest
): Promise<EmailConfig> {
  const response = await fetch("/api/management/email-configs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to create email configuration");
  }

  return await response.json();
}

/**
 * Update an email configuration
 */
export async function updateEmailConfig(
  id: string,
  data: UpdateEmailConfigRequest
): Promise<EmailConfig> {
  const response = await fetch(`/api/management/email-configs/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to update email configuration");
  }

  return await response.json();
}

/**
 * Delete an email configuration
 */
export async function deleteEmailConfig(id: string): Promise<void> {
  const response = await fetch(`/api/management/email-configs/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to delete email configuration");
  }
}

/**
 * Test email configuration by sending a test email
 */
export async function testEmailConnection(
  id: string,
  data: TestEmailRequest
): Promise<TestEmailResult> {
  const response = await fetch(`/api/management/email-configs/${id}/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    // Still return the result even on error, as it contains useful error info
    return result;
  }

  return result;
}
