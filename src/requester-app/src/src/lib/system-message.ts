/**
 * System Message Utilities
 *
 * Utilities for detecting and parsing system messages which use bilingual format.
 * System messages from the backend are stored as "English|Arabic" format.
 * Also handles replacing technician names with "Support Agent" for privacy.
 */

import type { Language } from "@/context/language-context";

/**
 * Check if a message content is a system message (bilingual format)
 * System messages contain a pipe delimiter separating English and Arabic text.
 */
export function isSystemMessage(content: string): boolean {
  return content.includes("|");
}

/**
 * Parse bilingual format "English|Arabic" and return correct language version
 * Also handles format with sender prefix: "Unknown: English|Arabic"
 *
 * @param content - The message content to parse
 * @param language - The current language ("en" or "ar")
 * @returns The locale-specific message text
 */
export function parseSystemMessage(content: string, language: Language): string {
  // Check for pipe delimiter (bilingual format)
  if (!content.includes("|")) {
    return content;
  }

  // Split by pipe to get [English, Arabic]
  const parts = content.split("|");
  if (parts.length !== 2) {
    return content;
  }

  // Get the correct language part
  const localePart = language === "en" ? parts[0].trim() : parts[1].trim();

  // Remove "Unknown: " prefix if present (system messages may have this prefix)
  if (localePart.startsWith("Unknown: ")) {
    return localePart.replace("Unknown: ", "");
  }

  return localePart;
}

/**
 * Parse last message for ticket list display
 * - Parses bilingual system messages
 * - Shows actual sender names (including IT agents)
 *
 * @param content - The message content to parse
 * @param language - The current language ("en" or "ar")
 * @param _technicianName - Unused (kept for backwards compatibility)
 * @param _supportAgentLabel - Unused (kept for backwards compatibility)
 * @returns The processed message text
 */
export function parseLastMessage(
  content: string,
  language: Language,
  _technicianName?: string,
  _supportAgentLabel: string = "Support Agent"
): string {
  if (!content) return "";

  // Handle bilingual system messages
  let result = parseSystemMessage(content, language);

  // Handle only truly anonymous system prefixes (Unknown means no sender info)
  // Keep actual technician names as-is for transparency
  const prefixesToReplace = [
    "Unknown: ",
  ];

  for (const prefix of prefixesToReplace) {
    if (result.startsWith(prefix)) {
      // Remove the "Unknown: " prefix entirely since it provides no value
      result = result.slice(prefix.length);
      break;
    }
  }

  return result;
}
