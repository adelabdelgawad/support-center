/**
 * Validates and sanitizes redirect URLs to prevent open redirect attacks.
 *
 * Only allows:
 * - Relative paths starting with "/" (e.g., "/support-center/requests")
 * - Rejects absolute URLs, protocol-relative URLs (//), and external domains
 *
 * @param url - The redirect URL to validate
 * @param defaultPath - Default path to return if URL is invalid (default: "/support-center/requests")
 * @returns A safe redirect URL
 */
export function getSafeRedirectUrl(
  url: string | null | undefined,
  defaultPath: string = "/support-center/requests"
): string {
  // If no URL provided, return default
  if (!url) {
    return defaultPath;
  }

  // Trim whitespace
  const trimmedUrl = url.trim();

  // Must start with exactly one "/" (not "//")
  // This prevents:
  // - Absolute URLs (http://, https://, javascript:, data:, etc.)
  // - Protocol-relative URLs (//evil.com)
  // - Empty paths
  if (!trimmedUrl.startsWith("/") || trimmedUrl.startsWith("//")) {
    return defaultPath;
  }

  // Additional check: no protocol in the URL (catches edge cases like /\evil.com)
  if (trimmedUrl.includes(":") || trimmedUrl.includes("\\")) {
    return defaultPath;
  }

  // URL is safe - it's a relative path
  return trimmedUrl;
}
