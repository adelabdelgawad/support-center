/**
 * IP Address and CIDR Utility Module
 *
 * Provides utilities for IP address validation and CIDR range checking.
 * Used for network detection to determine whether client is on private network.
 *
 * Features:
 * - Parse CIDR notation (e.g., "10.0.0.0/8")
 * - Check if IP address is within CIDR range
 * - IPv4 support (IPv6 not currently needed)
 *
 * Usage:
 * ```ts
 * const isPrivate = isIPInCIDR('10.25.1.22', '10.0.0.0/8');
 * // true - 10.25.1.22 is within 10.0.0.0/8 range
 * ```
 */

/**
 * Parse IPv4 address to 32-bit integer
 * @param ip - IP address string (e.g., "10.25.1.22")
 * @returns 32-bit integer representation or null if invalid
 */
function parseIPv4(ip: string): number | null {
  const parts = ip.split('.');

  // Validate format (must have 4 octets)
  if (parts.length !== 4) {
    return null;
  }

  // Parse each octet
  let result = 0;
  for (let i = 0; i < 4; i++) {
    const octet = parseInt(parts[i], 10);

    // Validate octet (0-255)
    if (isNaN(octet) || octet < 0 || octet > 255) {
      return null;
    }

    // Shift and add to result
    result = (result << 8) | octet;
  }

  return result >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Parse CIDR notation to network address and netmask
 * @param cidr - CIDR notation string (e.g., "10.0.0.0/8")
 * @returns Object with network address and netmask, or null if invalid
 */
function parseCIDR(cidr: string): { network: number; netmask: number } | null {
  const parts = cidr.split('/');

  // Validate format
  if (parts.length !== 2) {
    console.error('[ip-utils] Invalid CIDR format (missing /): ', cidr);
    return null;
  }

  const [networkAddr, prefixLenStr] = parts;
  const prefixLen = parseInt(prefixLenStr, 10);

  // Validate prefix length (0-32 for IPv4)
  if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) {
    console.error('[ip-utils] Invalid CIDR prefix length:', prefixLen);
    return null;
  }

  // Parse network address
  const network = parseIPv4(networkAddr);
  if (network === null) {
    console.error('[ip-utils] Invalid network address in CIDR:', networkAddr);
    return null;
  }

  // Calculate netmask from prefix length
  // Example: /8 → 0xFF000000, /24 → 0xFFFFFF00
  const netmask = prefixLen === 0
    ? 0
    : (0xFFFFFFFF << (32 - prefixLen)) >>> 0;

  return { network, netmask };
}

/**
 * Check if an IP address is within a CIDR range
 * @param ip - IP address string (e.g., "10.25.1.22")
 * @param cidr - CIDR notation string (e.g., "10.0.0.0/8")
 * @returns True if IP is within CIDR range, false otherwise
 */
export function isIPInCIDR(ip: string, cidr: string): boolean {
  // Parse IP address
  const ipNum = parseIPv4(ip);
  if (ipNum === null) {
    console.warn('[ip-utils] Invalid IP address:', ip);
    return false;
  }

  // Parse CIDR range
  const range = parseCIDR(cidr);
  if (range === null) {
    console.warn('[ip-utils] Invalid CIDR notation:', cidr);
    return false;
  }

  // Check if IP is within range
  // Apply netmask to both network and IP, then compare
  const ipNetwork = (ipNum & range.netmask) >>> 0;
  const networkAddr = (range.network & range.netmask) >>> 0;

  return ipNetwork === networkAddr;
}

/**
 * Validate IPv4 address format
 * @param ip - IP address string
 * @returns True if valid IPv4 format, false otherwise
 */
export function isValidIPv4(ip: string): boolean {
  return parseIPv4(ip) !== null;
}

/**
 * Validate CIDR notation format
 * @param cidr - CIDR notation string
 * @returns True if valid CIDR format, false otherwise
 */
export function isValidCIDR(cidr: string): boolean {
  return parseCIDR(cidr) !== null;
}

/**
 * Format IP address for display (validation + normalization)
 * @param ip - IP address string
 * @returns Normalized IP string or null if invalid
 */
export function formatIPv4(ip: string): string | null {
  const num = parseIPv4(ip);
  if (num === null) {
    return null;
  }

  // Convert back to string (normalizes format)
  const octet1 = (num >>> 24) & 0xFF;
  const octet2 = (num >>> 16) & 0xFF;
  const octet3 = (num >>> 8) & 0xFF;
  const octet4 = num & 0xFF;

  return `${octet1}.${octet2}.${octet3}.${octet4}`;
}
