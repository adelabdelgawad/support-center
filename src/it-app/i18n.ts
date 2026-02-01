import { getRequestConfig } from 'next-intl/server';

export const locales = ['en', 'ar'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ar'; // Arabic default as per project requirements

export default getRequestConfig(async ({ locale }) => ({
  locale: locale ?? defaultLocale,
  messages: (await import(`./messages/${locale}.json`)).default,
  timeZone: 'Africa/Cairo',
  now: new Date(),
}));
