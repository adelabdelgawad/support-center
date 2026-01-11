/**
 * Language Toggle Component
 *
 * Enhanced button to switch between English and Arabic
 * Features:
 * - Improved contrast and visibility
 * - Clear state indication
 * - Bilingual labels showing both languages
 * - Proper RTL icon positioning
 * - Dark mode support
 */

import { Languages } from "lucide-solid";
import { useLanguage } from "@/context/language-context";
import { Button } from "@/components/ui/button";

export function LanguageToggle() {
  const { language, toggleLanguage, t } = useLanguage();

  return (
    <Button
      onClick={toggleLanguage}
      variant="outline"
      class="flex items-center gap-2 h-10 px-4 rounded-lg border-2 border-accent bg-card hover:bg-accent/10 transition-all shadow-sm"
      aria-label={`Switch to ${language() === "en" ? "Arabic" : "English"}`}
    >
      <Languages class="h-5 w-5 text-accent" />
      <span class="text-sm font-semibold text-accent-foreground">
        {language() === "en" ? "العربية" : "English"}
      </span>
    </Button>
  );
}
