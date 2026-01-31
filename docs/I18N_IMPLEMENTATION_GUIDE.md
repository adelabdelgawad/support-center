# Internationalization (i18n) Implementation Guide

## Overview

Basic i18n infrastructure has been implemented using `next-intl` for Next.js App Router. This provides a foundation for multi-language support (English/Arabic) with RTL (Right-to-Left) layout support for Arabic.

## Current Implementation

### Files Created

1. **i18n.ts** - i18n configuration
2. **messages/en.json** - English translations
3. **messages/ar.json** - Arabic translations (العربية)
4. **middleware.i18n.ts** - Locale detection and routing (NOT YET INTEGRATED)
5. **lib/components/language-switcher.tsx** - Language switcher component

### Supported Languages

- **English (en)** - Left-to-right (LTR)
- **Arabic (ar)** - Right-to-left (RTL) - Default language

### Features

- Automatic locale detection from cookies/headers
- Type-safe translations
- RTL support for Arabic
- Date/time localization (Cairo timezone)
- Fallback to default locale

## Integration Steps

### 1. Integrate Middleware

The i18n middleware (`middleware.i18n.ts`) needs to be integrated with the existing middleware or run separately.

**Option A: Merge with existing middleware.ts**
```typescript
// middleware.ts
import createIntlMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n';

// ... existing middleware logic ...

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
  localeDetection: true,
});

export default function middleware(request: NextRequest) {
  // Run i18n middleware first
  const intlResponse = intlMiddleware(request);
  if (intlResponse) return intlResponse;

  // ... existing middleware logic ...
}
```

### 2. Wrap App with NextIntlClientProvider

Update `app/layout.tsx` or create `app/[locale]/layout.tsx`:

```typescript
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

export default async function LocaleLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const messages = await getMessages();

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

### 3. Use Translations in Components

**Server Components:**
```typescript
import { useTranslations } from 'next-intl';

export default function MyServerComponent() {
  const t = useTranslations('common');

  return <h1>{t('appName')}</h1>; // "IT Support Center" or "مركز الدعم الفني"
}
```

**Client Components:**
```typescript
'use client';
import { useTranslations } from 'next-intl';

export default function MyClientComponent() {
  const t = useTranslations('requests');

  return <button>{t('create')}</button>; // "Create Request" or "إنشاء طلب"
}
```

### 4. Add Language Switcher to UI

Add the `LanguageSwitcher` component to your navbar or settings:

```typescript
import { LanguageSwitcher } from '@/lib/components/language-switcher';

export function Navbar() {
  return (
    <nav>
      {/* ... other nav items ... */}
      <LanguageSwitcher />
    </nav>
  );
}
```

### 5. RTL Styling

Tailwind CSS v4 supports RTL automatically. For custom styles:

```css
/* Automatically works with dir="rtl" */
.my-element {
  margin-left: 1rem; /* becomes margin-right in RTL */
  text-align: left;  /* becomes text-align: right in RTL */
}

/* Explicit RTL styles if needed */
[dir="rtl"] .my-element {
  /* RTL-specific styles */
}
```

## Translation File Structure

The translation files are organized by namespace:

```json
{
  "common": {
    "appName": "...",
    "loading": "...",
    ...
  },
  "nav": {
    "dashboard": "...",
    "requests": "...",
    ...
  },
  "requests": {
    "title": "...",
    ...
  },
  ...
}
```

## Adding New Translations

1. **Add to EN file** (`messages/en.json`):
```json
{
  "newSection": {
    "newKey": "New text in English"
  }
}
```

2. **Add to AR file** (`messages/ar.json`):
```json
{
  "newSection": {
    "newKey": "نص جديد بالعربية"
  }
}
```

3. **Use in component**:
```typescript
const t = useTranslations('newSection');
return <p>{t('newKey')}</p>;
```

## Type Safety

Create a types file for translation keys:

```typescript
// lib/types/i18n.ts
import type en from '@/messages/en.json';

export type Messages = typeof en;
export type Locale = 'en' | 'ar';

declare global {
  interface IntlMessages extends Messages {}
}
```

Then TypeScript will autocomplete translation keys!

## Date/Time Formatting

```typescript
import { useFormatter } from 'next-intl';

export function MyComponent() {
  const format = useFormatter();
  const date = new Date();

  return (
    <>
      <p>{format.dateTime(date, { dateStyle: 'full' })}</p>
      <p>{format.number(1234.56, { style: 'currency', currency: 'EGP' })}</p>
    </>
  );
}
```

## Current Limitations

1. **Middleware not integrated** - Need to merge with existing middleware
2. **Partial translations** - Only common strings translated, app-specific content needs translation
3. **No route structure** - Current app structure doesn't use `[locale]` dynamic segments
4. **No language preference persistence** - Need to save user's language choice to database

## Recommended Next Steps

1. Integrate middleware with existing middleware.ts
2. Restructure app to use `app/[locale]/` pattern
3. Translate all user-facing strings in:
   - Navigation components
   - Form labels and validation messages
   - Error messages
   - Button text
   - Page titles and descriptions
4. Add language preference to User model
5. Save language preference to user settings
6. Add automated translation testing
7. Create translation management workflow for non-technical translators

## Resources

- [next-intl Documentation](https://next-intl-docs.vercel.app/)
- [Next.js i18n Routing](https://nextjs.org/docs/app/building-your-application/routing/internationalization)
- [RTL Styling Guide](https://rtlstyling.com/)
- [Arabic Typography Best Practices](https://ar.wikipedia.org/wiki/%D8%AE%D8%B7_%D8%B9%D8%B1%D8%A8%D9%8A)

## Testing

```bash
# Test i18n setup
bun run dev

# Visit:
# http://localhost:3010/en      (English)
# http://localhost:3010/ar      (Arabic - should show RTL)
# http://localhost:3010         (Should default to Arabic)
```

## Summary

A foundational i18n system is now in place. To complete the implementation:
- Integrate middleware
- Restructure routes for locale segments
- Translate remaining UI strings
- Add user language preferences
