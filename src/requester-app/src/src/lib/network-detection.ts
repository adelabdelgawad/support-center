/**
 * Network Detection Module
 *
 * Determines whether the client is on a private network or public internet
 * based on the local IP address and configured CIDR range.
 *
 * This module provides intelligent backend endpoint selection:
 * - Private network (10.x.x.x) → Use internal domain (supportcenter.andalusia.loc)
 * - Public network → Use external domain (supportcenter.andalusiagroup.net)
 *
 * Configuration via .env:
 * - VITE_SUPPORTCENTER_DOMAIN_INTERNAL: Internal DNS (private network)
 * - VITE_SUPPORTCENTER_DOMAIN_EXTERNAL: External DNS (public internet)
 * - VITE_SUPPORTCENTER_PRIVATE_IP_RANGE: CIDR range for private network detection
 * - VITE_API_PROTOCOL: HTTP protocol for API (http/https)
 * - VITE_SIGNALR_PROTOCOL: Protocol for SignalR (http/https/wss)
 *
 * Usage:
 * ```ts
 * const detector = new NetworkDetector();
 * await detector.initialize();
 * const apiUrl = detector.getAPIUrl();
 * const signalRUrl = detector.getSignalRUrl();
 * ```
 */

import { invoke } from '@tauri-apps/api/core';
import { isIPInCIDR, isValidCIDR, isValidIPv4 } from './ip-utils';

/**
 * Network location enum
 */
export enum NetworkLocation {
  PRIVATE = 'private',  // Client is on private network (10.x.x.x)
  PUBLIC = 'public',    // Client is on public internet
  UNKNOWN = 'unknown',  // Could not determine location
}

/**
 * Network detection result
 */
export interface NetworkDetectionResult {
  location: NetworkLocation;
  localIP: string | null;
  apiUrl: string;
  signalRUrl: string;
  reason: string;
}

/**
 * Environment configuration from .env
 */
interface EnvConfig {
  domainInternal: string | undefined;
  domainExternal: string | undefined;
  privateIPRange: string | undefined;
  apiProtocol: string;
  signalRProtocol: string;
}

/**
 * Network Detector Class
 *
 * Handles network location detection and endpoint URL generation.
 */
export class NetworkDetector {
  private localIP: string | null = null;
  private location: NetworkLocation = NetworkLocation.UNKNOWN;
  private config: EnvConfig;
  private detectionResult: NetworkDetectionResult | null = null;

  constructor() {
    // Load configuration from environment variables
    this.config = {
      domainInternal: import.meta.env.VITE_SUPPORTCENTER_DOMAIN_INTERNAL,
      domainExternal: import.meta.env.VITE_SUPPORTCENTER_DOMAIN_EXTERNAL,
      privateIPRange: import.meta.env.VITE_SUPPORTCENTER_PRIVATE_IP_RANGE,
      apiProtocol: import.meta.env.VITE_API_PROTOCOL || 'http',
      signalRProtocol: import.meta.env.VITE_SIGNALR_PROTOCOL || 'https',
    };

    console.log('[NetworkDetector] Configuration loaded:', {
      domainInternal: this.config.domainInternal,
      domainExternal: this.config.domainExternal,
      privateIPRange: this.config.privateIPRange,
      apiProtocol: this.config.apiProtocol,
      signalRProtocol: this.config.signalRProtocol,
    });
  }

  /**
   * Initialize network detection
   * Retrieves local IP and determines network location
   */
  async initialize(): Promise<void> {
    // Validate required configuration
    if (!this.config.privateIPRange) {
      console.error('[NetworkDetector] FATAL: VITE_SUPPORTCENTER_PRIVATE_IP_RANGE not configured');
      throw new Error('VITE_SUPPORTCENTER_PRIVATE_IP_RANGE is required in .env file');
    }

    if (!isValidCIDR(this.config.privateIPRange)) {
      console.error('[NetworkDetector] FATAL: Invalid CIDR format:', this.config.privateIPRange);
      throw new Error(`Invalid CIDR format: ${this.config.privateIPRange}`);
    }

    if (!this.config.domainInternal && !this.config.domainExternal) {
      console.error('[NetworkDetector] FATAL: No domains configured (need INTERNAL or EXTERNAL)');
      throw new Error('At least one of VITE_SUPPORTCENTER_DOMAIN_INTERNAL or VITE_SUPPORTCENTER_DOMAIN_EXTERNAL must be configured');
    }

    // Get local IP from Tauri
    try {
      this.localIP = await invoke<string>('get_local_ip');
      console.log('[NetworkDetector] Local IP retrieved:', this.localIP);

      // Validate IP format
      if (!isValidIPv4(this.localIP)) {
        console.warn('[NetworkDetector] Invalid IP format returned from get_local_ip:', this.localIP);
        this.localIP = null;
      }
    } catch (error) {
      console.error('[NetworkDetector] Failed to get local IP:', error);
      this.localIP = null;
    }

    // Determine network location
    this.location = this.detectNetworkLocation();

    // Generate URLs based on location
    const { apiUrl, signalRUrl, reason } = this.generateURLs();

    this.detectionResult = {
      location: this.location,
      localIP: this.localIP,
      apiUrl,
      signalRUrl,
      reason,
    };

    console.log('[NetworkDetector] Detection complete:', this.detectionResult);
  }

  /**
   * Detect network location based on local IP and CIDR range
   * @returns Network location enum
   */
  private detectNetworkLocation(): NetworkLocation {
    // Cannot detect without local IP
    if (!this.localIP) {
      console.warn('[NetworkDetector] Cannot detect location: local IP not available');
      return NetworkLocation.UNKNOWN;
    }

    // Check if IP is within private range
    const isPrivate = isIPInCIDR(this.localIP, this.config.privateIPRange!);

    console.log('[NetworkDetector] IP range check:', {
      localIP: this.localIP,
      privateIPRange: this.config.privateIPRange,
      isPrivate,
    });

    return isPrivate ? NetworkLocation.PRIVATE : NetworkLocation.PUBLIC;
  }

  /**
   * Generate backend URLs based on network location
   * @returns Object with API and SignalR URLs + reason
   */
  private generateURLs(): { apiUrl: string; signalRUrl: string; reason: string } {
    // CASE 1: Private network - use internal domain for API, external for SignalR (SSL cert)
    if (this.location === NetworkLocation.PRIVATE) {
      const apiDomain = this.config.domainInternal || this.config.domainExternal;
      // Always use external domain for SignalR - it has a valid SSL certificate
      const signalRDomain = this.config.domainExternal || this.config.domainInternal;

      if (!apiDomain || !signalRDomain) {
        throw new Error('No domain configured for private network access');
      }

      const apiUrl = `${this.config.apiProtocol}://${apiDomain}/api/v1`;
      const signalRUrl = `${this.config.signalRProtocol}://${signalRDomain}/signalr`;

      return {
        apiUrl,
        signalRUrl,
        reason: `Private network detected (IP: ${this.localIP} in ${this.config.privateIPRange}) - using internal domain for API, external for SignalR (SSL)`,
      };
    }

    // CASE 2: Public network - use external domain
    if (this.location === NetworkLocation.PUBLIC) {
      const domain = this.config.domainExternal || this.config.domainInternal;

      if (!domain) {
        throw new Error('No domain configured for public network access');
      }

      const apiUrl = `${this.config.apiProtocol}://${domain}/api/v1`;
      const signalRUrl = `${this.config.signalRProtocol}://${domain}/signalr`;

      return {
        apiUrl,
        signalRUrl,
        reason: `Public network detected (IP: ${this.localIP} not in ${this.config.privateIPRange}) - using external domain`,
      };
    }

    // CASE 3: Unknown location - fallback to external domain
    const domain = this.config.domainExternal || this.config.domainInternal;

    if (!domain) {
      throw new Error('No domain configured and network location unknown');
    }

    const apiUrl = `${this.config.apiProtocol}://${domain}/api/v1`;
    const signalRUrl = `${this.config.signalRProtocol}://${domain}/signalr`;

    return {
      apiUrl,
      signalRUrl,
      reason: `Network location unknown (could not get local IP) - using external domain as fallback`,
    };
  }

  /**
   * Get API server URL
   * @returns API base URL with /api/v1 path
   */
  getAPIUrl(): string {
    if (!this.detectionResult) {
      throw new Error('NetworkDetector not initialized. Call initialize() first.');
    }
    return this.detectionResult.apiUrl;
  }

  /**
   * Get SignalR hub URL
   * @returns SignalR hub URL with /signalr path
   */
  getSignalRUrl(): string {
    if (!this.detectionResult) {
      throw new Error('NetworkDetector not initialized. Call initialize() first.');
    }
    return this.detectionResult.signalRUrl;
  }

  /**
   * Get full detection result
   * @returns Complete network detection result
   */
  getDetectionResult(): NetworkDetectionResult {
    if (!this.detectionResult) {
      throw new Error('NetworkDetector not initialized. Call initialize() first.');
    }
    return this.detectionResult;
  }

  /**
   * Check if detection is initialized
   * @returns True if initialized, false otherwise
   */
  isInitialized(): boolean {
    return this.detectionResult !== null;
  }

  /**
   * Get current network location
   * @returns Network location enum
   */
  getLocation(): NetworkLocation {
    return this.location;
  }

  /**
   * Get local IP address
   * @returns Local IP string or null if not available
   */
  getLocalIP(): string | null {
    return this.localIP;
  }
}

/**
 * Singleton instance for global access
 * Use this instead of creating new instances
 */
export const networkDetector = new NetworkDetector();
