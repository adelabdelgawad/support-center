/**
 * Runtime Configuration Manager
 *
 * Provides API and SignalR URLs with intelligent network detection.
 *
 * Automatically detects whether the client is on a private network (inside office)
 * or public network (remote/home) and selects the appropriate backend endpoints:
 *
 * - Private network (10.x.x.x) → Internal domain (supportcenter.andalusia.loc)
 * - Public network → External domain (supportcenter.andalusiagroup.net)
 * - SignalR always uses external domain (has valid SSL certificate)
 *
 * Configuration via .env:
 * - VITE_SUPPORTCENTER_DOMAIN_INTERNAL: Internal DNS for private network
 * - VITE_SUPPORTCENTER_DOMAIN_EXTERNAL: External DNS for public network
 * - VITE_SUPPORTCENTER_PRIVATE_IP_RANGE: CIDR range for detection (e.g., 10.0.0.0/8)
 *
 * Usage:
 * ```ts
 * // Initialize once on app startup
 * await RuntimeConfig.initialize();
 *
 * // Get URLs
 * const apiUrl = RuntimeConfig.getServerAddress();
 * const signalRUrl = RuntimeConfig.getSignalRAddress();
 * ```
 */

import { networkDetector, NetworkLocation } from './network-detection';
import type { NetworkDetectionResult } from './network-detection';

/**
 * Normalize SignalR URL to use http/https instead of ws/wss
 * SignalR negotiation requires HTTP, not WebSocket - the client handles upgrade internally
 */
function normalizeSignalRUrl(url: string): string {
  if (url.startsWith('wss://')) {
    return url.replace('wss://', 'https://');
  }
  if (url.startsWith('ws://')) {
    return url.replace('ws://', 'http://');
  }
  return url;
}

class RuntimeConfigManager {
  private initialized: boolean = false;
  private detectionResult: NetworkDetectionResult | null = null;

  constructor() {
    console.log('[RuntimeConfig] Created (not yet initialized)');
  }

  /**
   * Initialize runtime configuration
   * MUST be called before getting URLs
   *
   * This performs network detection (if dynamic mode) and determines
   * which backend endpoints to use.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[RuntimeConfig] Already initialized, skipping');
      return;
    }

    console.log('[RuntimeConfig] Initializing...');

    try {
      // Initialize network detector (handles both static and dynamic modes)
      await networkDetector.initialize();

      // Get detection result
      this.detectionResult = networkDetector.getDetectionResult();

      this.initialized = true;

      console.log('[RuntimeConfig] Initialized successfully:', {
        mode: this.detectionResult.location === NetworkLocation.UNKNOWN ? 'static' : 'dynamic',
        location: this.detectionResult.location,
        localIP: this.detectionResult.localIP,
        apiUrl: this.detectionResult.apiUrl,
        signalRUrl: this.detectionResult.signalRUrl,
        reason: this.detectionResult.reason,
      });
    } catch (error) {
      console.error('[RuntimeConfig] Initialization failed:', error);
      throw new Error(`RuntimeConfig initialization failed: ${error}`);
    }
  }

  /**
   * Get API server address
   * @throws Error if not initialized
   */
  getServerAddress(): string {
    if (!this.initialized || !this.detectionResult) {
      throw new Error('RuntimeConfig not initialized. Call initialize() first.');
    }
    return this.detectionResult.apiUrl;
  }

  /**
   * Get SignalR hub address
   * @throws Error if not initialized
   */
  getSignalRAddress(): string {
    if (!this.initialized || !this.detectionResult) {
      throw new Error('RuntimeConfig not initialized. Call initialize() first.');
    }
    return normalizeSignalRUrl(this.detectionResult.signalRUrl);
  }

  /**
   * Refresh network detection (re-detect location)
   * Useful if network changes (e.g., laptop moved between networks)
   */
  async refresh(): Promise<void> {
    console.log('[RuntimeConfig] Refreshing network detection...');
    this.initialized = false;
    this.detectionResult = null;
    await this.initialize();
  }

  /**
   * Get current configuration state (for debugging)
   */
  getDebugInfo(): {
    initialized: boolean;
    location: NetworkLocation;
    localIP: string | null;
    serverAddress: string;
    signalRAddress: string;
    reason: string;
  } {
    if (!this.initialized || !this.detectionResult) {
      return {
        initialized: false,
        location: NetworkLocation.UNKNOWN,
        localIP: null,
        serverAddress: 'NOT_INITIALIZED',
        signalRAddress: 'NOT_INITIALIZED',
        reason: 'RuntimeConfig.initialize() not called',
      };
    }

    return {
      initialized: true,
      location: this.detectionResult.location,
      localIP: this.detectionResult.localIP,
      serverAddress: this.detectionResult.apiUrl,
      signalRAddress: normalizeSignalRUrl(this.detectionResult.signalRUrl),
      reason: this.detectionResult.reason,
    };
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get network detection result
   * @returns Full detection result or null if not initialized
   */
  getNetworkDetection(): NetworkDetectionResult | null {
    return this.detectionResult;
  }
}

// Export singleton instance
export const RuntimeConfig = new RuntimeConfigManager();
