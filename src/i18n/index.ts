import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ar from './locales/ar';
import en from './locales/en';

import { deviceLanguage, type LanguageCode } from './direction';

export * from './direction';

/** Own key rather than one from the repository, so i18n can start before the store loads. */
const LANGUAGE_KEY = '@nutrition/v1/language';

export const LANGUAGES: { code: LanguageCode; label: string; englishLabel: string }[] = [
  { code: 'en', label: 'English', englishLabel: 'English' },
  { code: 'ar', label: 'العربية', englishLabel: 'Arabic' },
];

export const resources = {
  en: en as unknown as Record<string, Record<string, string>>,
  ar: ar as unknown as Record<string, Record<string, string>>,
};

export const NAMESPACES = Object.keys(en) as (keyof typeof en)[];

let started = false;

/**
 * Starts i18next synchronously with a best-guess language so the first render
 * already has copy, then swaps to the stored preference once AsyncStorage
 * answers. Returns the language actually applied.
 */
export async function initI18n(): Promise<LanguageCode> {
  if (!started) {
    started = true;
    await i18n.use(initReactI18next).init({
      resources,
      lng: deviceLanguage(),
      fallbackLng: 'en',
      defaultNS: 'common',
      ns: NAMESPACES as string[],
      interpolation: { escapeValue: false },
      returnNull: false,
      // React Native has no Suspense boundary around the tree by default.
      react: { useSuspense: false },
    });
  }

  const stored = await readStoredLanguage();
  const next = stored ?? deviceLanguage();
  if (i18n.language !== next) await i18n.changeLanguage(next);
  return next;
}

async function readStoredLanguage(): Promise<LanguageCode | null> {
  try {
    const raw = await AsyncStorage.getItem(LANGUAGE_KEY);
    return raw === 'ar' || raw === 'en' ? raw : null;
  } catch {
    return null;
  }
}

export async function persistLanguage(language: LanguageCode): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, language);
  } catch (error) {
    console.warn('[i18n] could not persist language', error);
  }
}

export async function changeLanguage(language: LanguageCode): Promise<void> {
  await persistLanguage(language);
  await i18n.changeLanguage(language);
}

export function currentLanguage(): LanguageCode {
  return i18n.language === 'ar' ? 'ar' : 'en';
}

export default i18n;
