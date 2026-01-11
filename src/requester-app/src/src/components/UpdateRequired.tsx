/**
 * UpdateRequired Component - Phase 8 Silent Desktop Upgrade UI
 *
 * Blocking screen shown when version enforcement rejects login.
 * Handles:
 * - Automatic silent upgrade (if enabled and installer URL available)
 * - Manual download fallback
 * - Progress indication
 * - Error recovery
 */

import { Component, createSignal, Show, onMount } from "solid-js";
import type { VersionEnforcementError, UpdateState } from "@/types";
import {
  performSilentUpgrade,
  canPerformSilentUpgrade,
  openInstallerDownload,
  isSilentUpgradeEnabled,
} from "@/api/update-service";

interface UpdateRequiredProps {
  enforcementData: VersionEnforcementError;
  onRetry?: () => void;
}

/**
 * UpdateRequired - Blocking update screen
 */
const UpdateRequired: Component<UpdateRequiredProps> = (props) => {
  const [state, setState] = createSignal<UpdateState>({
    isUpdateRequired: true,
    isDownloading: false,
    isInstalling: false,
    downloadProgress: 0,
    error: null,
    enforcementData: props.enforcementData,
  });

  const [autoUpgradeAttempted, setAutoUpgradeAttempted] = createSignal(false);

  // Attempt automatic silent upgrade on mount
  onMount(async () => {
    if (canPerformSilentUpgrade(props.enforcementData) && isSilentUpgradeEnabled()) {
      await startSilentUpgrade();
    }
  });

  /**
   * Start the silent upgrade process
   */
  const startSilentUpgrade = async () => {
    if (autoUpgradeAttempted()) {
      // Don't retry automatically - user must click button
      return;
    }

    setAutoUpgradeAttempted(true);
    setState((s) => ({ ...s, error: null }));

    try {
      await performSilentUpgrade(props.enforcementData, (progress) => {
        setState((s) => ({ ...s, ...progress }));
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Update failed";
      setState((s) => ({
        ...s,
        isDownloading: false,
        isInstalling: false,
        error: errorMessage,
      }));
    }
  };

  /**
   * Handle manual download button click
   */
  const handleManualDownload = async () => {
    if (!props.enforcementData.installerUrl) return;

    try {
      await openInstallerDownload(props.enforcementData.installerUrl);
    } catch (error) {
      console.error("[update] Failed to open download:", error);
    }
  };

  /**
   * Retry the upgrade process
   */
  const handleRetry = async () => {
    setState((s) => ({ ...s, error: null }));
    setAutoUpgradeAttempted(false);

    if (canPerformSilentUpgrade(props.enforcementData)) {
      await startSilentUpgrade();
    }
  };

  return (
    <div class="update-required-container">
      <div class="update-required-card">
        {/* Header */}
        <div class="update-header">
          <div class="update-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <h1 class="update-title">Update Required</h1>
        </div>

        {/* Message */}
        <p class="update-message">{props.enforcementData.message}</p>

        {/* Version info */}
        <div class="version-info">
          <div class="version-row">
            <span class="version-label">Current version:</span>
            <span class="version-value">{props.enforcementData.currentVersion}</span>
          </div>
          <div class="version-row">
            <span class="version-label">Required version:</span>
            <span class="version-value version-target">
              {props.enforcementData.targetVersion}
            </span>
          </div>
        </div>

        {/* Progress indicator */}
        <Show when={state().isDownloading || state().isInstalling}>
          <div class="update-progress">
            <div class="progress-spinner" />
            <span class="progress-text">
              {state().isDownloading
                ? "Downloading update..."
                : "Installing update..."}
            </span>
            <Show when={state().isDownloading}>
              <div class="progress-bar-container">
                <div
                  class="progress-bar"
                  style={{ width: `${state().downloadProgress}%` }}
                />
              </div>
            </Show>
          </div>
        </Show>

        {/* Error state */}
        <Show when={state().error}>
          <div class="update-error">
            <div class="error-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <span class="error-text">{state().error}</span>
          </div>
        </Show>

        {/* Actions */}
        <div class="update-actions">
          <Show
            when={
              !state().isDownloading &&
              !state().isInstalling &&
              canPerformSilentUpgrade(props.enforcementData)
            }
          >
            <button class="btn btn-primary" onClick={handleRetry}>
              {state().error ? "Retry Update" : "Update Now"}
            </button>
          </Show>

          <Show when={props.enforcementData.installerUrl}>
            <button class="btn btn-secondary" onClick={handleManualDownload}>
              Download Manually
            </button>
          </Show>

          <Show when={props.onRetry && state().error}>
            <button class="btn btn-text" onClick={props.onRetry}>
              Try Login Again
            </button>
          </Show>
        </div>

        {/* Help text */}
        <p class="update-help">
          If automatic update fails, please download the installer manually and run
          it with administrator privileges.
        </p>
      </div>

      <style>{`
        .update-required-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          padding: 20px;
        }

        .update-required-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 32px;
          max-width: 420px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          text-align: center;
        }

        .update-header {
          margin-bottom: 24px;
        }

        .update-icon {
          color: #3b82f6;
          margin-bottom: 16px;
        }

        .update-title {
          font-size: 24px;
          font-weight: 600;
          color: #1f2937;
          margin: 0;
        }

        .update-message {
          color: #6b7280;
          font-size: 14px;
          margin-bottom: 24px;
          line-height: 1.5;
        }

        .version-info {
          background: #f3f4f6;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 24px;
        }

        .version-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
        }

        .version-label {
          color: #6b7280;
          font-size: 13px;
        }

        .version-value {
          font-family: monospace;
          font-size: 14px;
          color: #374151;
        }

        .version-target {
          color: #10b981;
          font-weight: 600;
        }

        .update-progress {
          margin-bottom: 24px;
        }

        .progress-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #e5e7eb;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 12px;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .progress-text {
          color: #6b7280;
          font-size: 14px;
          display: block;
          margin-bottom: 12px;
        }

        .progress-bar-container {
          height: 4px;
          background: #e5e7eb;
          border-radius: 2px;
          overflow: hidden;
        }

        .progress-bar {
          height: 100%;
          background: #3b82f6;
          transition: width 0.3s ease;
        }

        .update-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .error-icon {
          color: #ef4444;
          flex-shrink: 0;
        }

        .error-text {
          color: #dc2626;
          font-size: 13px;
          text-align: left;
        }

        .update-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 24px;
        }

        .btn {
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
        }

        .btn-primary:hover {
          background: #2563eb;
        }

        .btn-secondary {
          background: #f3f4f6;
          color: #374151;
        }

        .btn-secondary:hover {
          background: #e5e7eb;
        }

        .btn-text {
          background: transparent;
          color: #6b7280;
        }

        .btn-text:hover {
          color: #374151;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .update-help {
          color: #9ca3af;
          font-size: 12px;
          margin: 0;
        }
      `}</style>
    </div>
  );
};

export default UpdateRequired;
