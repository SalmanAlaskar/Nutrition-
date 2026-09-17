import type en from './locales/en';

/**
 * Makes every t() key checked against the English resources. A key that only
 * exists in one language is a compile error, which is the point.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: typeof en;
    returnNull: false;
  }
}
