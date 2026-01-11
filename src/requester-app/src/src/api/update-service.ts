/**
 * Update Service - Phase 8 Silent Desktop Upgrade
 *
 * Handles version enforcement detection, installer download, and silent upgrade execution.
 *
 * Trigger conditions (ALL must be true):
 * 1. Desktop client receives HTTP 426 response
 * 2. Response contains reason = "version_enforced" and installer_url
 * 3. Client is NOT already upgrading
 * 4. Feature flag allows silent upgrade
 *
 * Safety:
 * - Never auto-install without enforcement rejection
 * - Never loop endlessly on failure
 * - Never delete existing install manually
 */

import type { VersionEnforcementError, UpdateState } from "@/types";
import { isTauri } from "./auth";

/**
 * Default update state
 */
export const defaultUpdateState: UpdateState = {
  isUpdateRequired: false,
  isDownloading: false,
  isInstalling: false,
  downloadProgress: 0,
  error: null,
  enforcementData: null,
};

/**
 * Check if an error response is a version enforcement rejection (HTTP 426)
 */
export function isVersionEnforcementError(error: unknown): error is { status: number; data: VersionEnforcementError } {
  if (!error || typeof error !== "object") return false;

  const err = error as Record<string, unknown>;

  // Check for 426 status
  if (err.status !== 426) return false;

  // Check for enforcement data
  const data = err.data as Record<string, unknown> | undefined;
  if (!data) return false;

  return data.reason === "version_enforced";
}

/**
 * Extract version enforcement data from an API error
 */
export function extractEnforcementData(error: unknown): VersionEnforcementError | null {
  if (!isVersionEnforcementError(error)) return null;

  const data = (error as { data: Record<string, unknown> }).data;

  return {
    reason: "version_enforced",
    targetVersion: data.target_version as string || data.targetVersion as string || "",
    message: data.message as string || "Update required",
    versionStatus: (data.version_status as string || data.versionStatus as string || "outdated_enforced") as "outdated_enforced" | "unknown",
    currentVersion: data.current_version as string || data.currentVersion as string || "",
    installerUrl: data.installer_url as string || data.installerUrl as string || undefined,
    silentInstallArgs: data.silent_install_args as string || data.silentInstallArgs as string || "/S",
  };
}

/**
 * Check if silent upgrade is enabled
 * Default: enabled in Tauri, disabled otherwise
 */
export function isSilentUpgradeEnabled(): boolean {
  // Feature flag - can be overridden via storage
  // For now, default to true in Tauri environment
  return isTauri();
}

/**
 * Check if installer metadata is available for silent upgrade
 */
export function canPerformSilentUpgrade(data: VersionEnforcementError | null): boolean {
  if (!data) return false;
  if (!data.installerUrl) return false;
  if (!isSilentUpgradeEnabled()) return false;
  return true;
}

/**
 * Download the installer from the provided URL
 * Uses Tauri command for actual download
 *
 * @param installerUrl - URL to download the installer from
 * @param targetVersion - Target version string for filename
 * @returns Path to downloaded installer file
 */
export async function downloadInstaller(
  installerUrl: string,
  targetVersion: string
): Promise<string> {
  if (!isTauri()) {
    throw new Error("Installer download is only supported in desktop app");
  }

  console.log("[update] Downloading installer from:", installerUrl);
  console.log("[update] Target version:", targetVersion);

  const { invoke } = await import("@tauri-apps/api/core");

  try {
    const installerPath = await invoke<string>("download_installer", {
      url: installerUrl,
      targetVersion: targetVersion,
    });

    console.log("[update] Downloaded to:", installerPath);
    return installerPath;
  } catch (error) {
    console.error("[update] Download failed:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to download installer"
    );
  }
}

/**
 * Execute the installer silently and exit the app
 * The installer will continue running after the app closes
 *
 * @param installerPath - Path to the downloaded installer
 * @param silentArgs - Command-line arguments for silent installation
 */
export async function executeInstallerAndExit(
  installerPath: string,
  silentArgs: string = "/S"
): Promise<void> {
  if (!isTauri()) {
    throw new Error("Installer execution is only supported in desktop app");
  }

  console.log("[update] Executing installer:", installerPath);
  console.log("[update] Silent args:", silentArgs);

  const { invoke } = await import("@tauri-apps/api/core");

  try {
    await invoke("execute_installer_and_exit", {
      installerPath: installerPath,
      silentArgs: silentArgs,
    });

    // This point should not be reached as app will exit
  } catch (error) {
    console.error("[update] Installer execution failed:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to execute installer"
    );
  }
}

/**
 * Open the installer URL in the default browser for manual download
 * Fallback when silent upgrade is not available
 */
export async function openInstallerDownload(installerUrl: string): Promise<void> {
  if (!installerUrl) {
    throw new Error("No installer URL available");
  }

  console.log("[update] Opening installer URL:", installerUrl);

  if (isTauri()) {
    // Use Tauri's shell plugin to open URL
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(installerUrl);
  } else {
    // Fallback to window.open
    window.open(installerUrl, "_blank");
  }
}

/**
 * Perform the full silent upgrade flow
 *
 * 1. Download the installer
 * 2. Execute the installer silently
 * 3. Exit the app
 *
 * @param enforcementData - Version enforcement data with installer URL
 * @param onProgress - Callback for progress updates
 */
export async function performSilentUpgrade(
  enforcementData: VersionEnforcementError,
  onProgress?: (state: Partial<UpdateState>) => void
): Promise<void> {
  if (!canPerformSilentUpgrade(enforcementData)) {
    throw new Error("Silent upgrade not available");
  }

  const { installerUrl, targetVersion, silentInstallArgs } = enforcementData;

  if (!installerUrl) {
    throw new Error("No installer URL provided");
  }

  try {
    // Stage 1: Download
    onProgress?.({ isDownloading: true, downloadProgress: 0 });

    const installerPath = await downloadInstaller(installerUrl, targetVersion);

    onProgress?.({ isDownloading: false, downloadProgress: 100 });

    // Stage 2: Install
    onProgress?.({ isInstalling: true });

    await executeInstallerAndExit(installerPath, silentInstallArgs || "/S");

    // App should have exited by now
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Update failed";
    onProgress?.({
      isDownloading: false,
      isInstalling: false,
      error: errorMessage,
    });
    throw error;
  }
}

/**
 * Get current app version from Tauri
 */
export async function getAppVersion(): Promise<string> {
  if (!isTauri()) {
    return "1.0.0"; // Fallback for browser
  }

  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "1.0.0";
  }
}

/**
 * Check if running with elevated privileges
 */
export async function isElevated(): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("is_elevated");
  } catch {
    return false;
  }
}

/**
 * Push update data received from IT admin via WebSocket
 */
export interface PushUpdateData {
  targetVersion: string;
  installerUrl: string | null;
  silentInstallArgs: string | null;
  releaseNotes: string | null;
  isEnforced: boolean;
}

/**
 * Update service singleton for handling push updates from IT admin
 */
class UpdateService {
  private updateInProgress = false;

  /**
   * Handle push update from IT admin
   * Directly downloads and installs the update silently
   */
  async handlePushUpdate(data: PushUpdateData): Promise<void> {
    console.log("[UpdateService] Push update received:", data);

    // Prevent multiple concurrent updates
    if (this.updateInProgress) {
      console.log("[UpdateService] Update already in progress, ignoring");
      return;
    }

    // Check if we have installer URL (required for push updates)
    if (!data.installerUrl) {
      console.error("[UpdateService] No installer URL provided, cannot perform update");
      return;
    }

    // Check if silent upgrade is enabled
    if (!isSilentUpgradeEnabled()) {
      console.log("[UpdateService] Silent upgrade disabled, opening browser");
      await openInstallerDownload(data.installerUrl);
      return;
    }

    // Perform silent upgrade directly
    try {
      this.updateInProgress = true;

      console.log("[UpdateService] Starting silent upgrade to version:", data.targetVersion);

      // Create enforcement data for the upgrade function
      const enforcementData: VersionEnforcementError = {
        reason: "version_enforced",
        targetVersion: data.targetVersion,
        message: `Updating to version ${data.targetVersion}`,
        versionStatus: data.isEnforced ? "outdated_enforced" : "outdated_enforced",
        currentVersion: await getAppVersion(),
        installerUrl: data.installerUrl,
        silentInstallArgs: data.silentInstallArgs || "/S",
      };

      await performSilentUpgrade(enforcementData, (state) => {
        console.log("[UpdateService] Upgrade progress:", state);
      });
    } catch (error) {
      console.error("[UpdateService] Silent upgrade failed:", error);
      this.updateInProgress = false;

      // Fall back to browser download
      if (data.installerUrl) {
        await openInstallerDownload(data.installerUrl);
      }
    }
  }

}

// Singleton export
export const updateService = new UpdateService();
