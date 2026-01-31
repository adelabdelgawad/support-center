'use client';

/**
 * Language Switcher Component
 *
 * Allows users to switch between supported languages (EN/AR).
 * Supports RTL layout switching for Arabic.
 */

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { locales, type Locale } from '@/i18n';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

const languageNames: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  const handleLanguageChange = (newLocale: Locale) => {
    // Remove current locale from pathname
    const pathnameWithoutLocale = pathname.replace(`/${locale}`, '');

    // Construct new path with new locale
    const newPath = `/${newLocale}${pathnameWithoutLocale || '/'}`;

    // Set document direction for RTL support
    if (newLocale === 'ar') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
    } else {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = 'en';
    }

    // Navigate to new locale
    router.push(newPath);
    router.refresh();
  };

  return (
    <Select value={locale} onValueChange={handleLanguageChange}>
      <SelectTrigger className="w-[140px]">
        <SelectValue placeholder="Select language" />
      </SelectTrigger>
      <SelectContent>
        {locales.map((loc) => (
          <SelectItem key={loc} value={loc}>
            {languageNames[loc]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
