/**
 * Device Fingerprinting Utility
 *
 * Generates a unique device fingerprint for security tracking and
 * anomaly detection during authentication.
 */

import FingerprintJS from "@fingerprintjs/fingerprintjs";

// Singleton promise to ensure FingerprintJS is loaded only once
let fpPromise: Promise<string> | null = null;

/**
 * Generate a unique device fingerprint
 *
 * This function uses FingerprintJS to create a stable identifier
 * based on browser and device characteristics.
 *
 * IMPORTANT: This only works in browser environments. Server-side
 * calls will return a fallback value.
 *
 * @returns Promise resolving to a unique device fingerprint string
 */
export async function generateDeviceFingerprint(): Promise<string> {
  // Check if we're in a browser environment
  if (typeof window === "undefined") {
    // Server-side: return a placeholder that backend will ignore
    return "server-side-no-fingerprint";
  }

  // Return existing promise if already loading
  if (fpPromise) {
    return fpPromise;
  }

  // Create and cache the promise
  fpPromise = (async () => {
    try {
      // Load FingerprintJS agent
      const fp = await FingerprintJS.load();

      // Get fingerprint result
      const result = await fp.get();

      // Return the visitor ID (stable across sessions)
      return result.visitorId;
    } catch (error) {
      console.error('Error generating device fingerprint:', error);
      // Fallback to a random ID if fingerprinting fails
      return `fallback_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }
  })();

  return fpPromise;
}

/**
 * Get comprehensive device information including fingerprint
 *
 * @returns Promise resolving to device information object
 */
export async function getDeviceInfo(): Promise<{
  fingerprint: string;
  userAgent: string;
  platform: string;
  language: string;
}> {
  const fingerprint = await generateDeviceFingerprint();

  return {
    fingerprint,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
    language: typeof navigator !== "undefined" ? navigator.language : "unknown",
  };
}

/**
 * Reset the cached fingerprint promise
 *
 * Useful for testing or forcing fingerprint regeneration
 */
export function resetFingerprint(): void {
  fpPromise = null;
}
