/**
 * Email Configuration Server Actions
 *
 * Server-side data fetching for email configuration management.
 */

"use server";

import { serverGet } from "@/lib/fetch/server";
import type { EmailConfig, EmailConfigListResponse } from "@/types/email-config";

/**
 * Get all email configurations
 */
export async function getEmailConfigs(
  skip: number = 0,
  limit: number = 100
): Promise<EmailConfigListResponse> {
  try {
    const response = await serverGet<EmailConfigListResponse>(
      `/email-configs?skip=${skip}&limit=${limit}`
    );

    return response;
  } catch (error) {
    console.error("Failed to fetch email configurations:", error);
    return { items: [], total: 0 };
  }
}

/**
 * Get the currently active email configuration
 */
export async function getActiveEmailConfig(): Promise<EmailConfig | null> {
  try {
    const response = await serverGet<EmailConfig>(
      "/email-configs/active"
    );

    return response;
  } catch (error) {
    console.error("Failed to fetch active email configuration:", error);
    return null;
  }
}
