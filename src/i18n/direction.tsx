import * as Localization from 'expo-localization';
import React, { createContext, useContext, useMemo } from 'react';
import { I18nManager, Platform } from 'react-native';

export type Direction = 'ltr' | 'rtl';
export type LanguageCode = 'en' | 'ar';

export const RTL_LANGUAGES: LanguageCode[] = ['ar'];

export function directionFor(language: LanguageCode): Direction {
  return RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
}

interface DirectionValue {
  language: LanguageCode;
  direction: Direction;
  isRTL: boolean;
  /**
   * Multiply a horizontal offset by this to keep it pointing the same way in
   * both directions. Only needed where a value cannot be expressed with a
   * logical style property, such as an SVG transform.
   */
  flip: 1 | -1;
}

const DirectionContext = createContext<DirectionValue>({
  language: 'en',
  direction: 'ltr',
  isRTL: false,
  flip: 1,
});

/**
 * Applies text direction on both platforms, which need different mechanisms.
 *
 * On the web, react-native-web's I18nManager is a no-op and its `isRTL` is
 * hard-coded false. Direction comes entirely from the `dir` attribute, which
 * makes the CSS logical properties that RNW compiles `marginStart` and friends
 * into actually resolve. So the web path sets `dir` on the document and passes
 * it down through context.
 *
 * On native, Yoga reads I18nManager, and a change only takes effect after the
 * app restarts. `setNativeDirection` persists the flag; the caller decides when
 * to reload.
 */
export function DirectionProvider({
  language,
  children,
}: {
  language: LanguageCode;
  children: React.ReactNode;
}) {
  const direction = directionFor(language);

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    // Set during render rather than in an effect so the very first paint is
    // already in the right direction and nothing visibly flips.
    if (document.documentElement.getAttribute('dir') !== direction) {
      document.documentElement.setAttribute('dir', direction);
      document.documentElement.setAttribute('lang', language);
    }
  }

  const value = useMemo<DirectionValue>(
    () => ({
      language,
      direction,
      isRTL: direction === 'rtl',
      flip: direction === 'rtl' ? -1 : 1,
    }),
    [language, direction],
  );

  return (
    <DirectionContext.Provider value={value}>{children}</DirectionContext.Provider>
  );
}

export function useDirection(): DirectionValue {
  return useContext(DirectionContext);
}

/**
 * Persists the native RTL flag. Returns true when the value changed, which
 * means the app has to restart before the layout follows. No-op on web, where
 * direction is applied live by DirectionProvider.
 */
export function setNativeDirection(language: LanguageCode): boolean {
  if (Platform.OS === 'web') return false;
  const shouldBeRTL = directionFor(language) === 'rtl';
  if (I18nManager.isRTL === shouldBeRTL) return false;
  I18nManager.allowRTL(shouldBeRTL);
  I18nManager.forceRTL(shouldBeRTL);
  return true;
}

/** The device's language, when the app supports it. */
export function deviceLanguage(): LanguageCode {
  const locales = Localization.getLocales();
  const code = locales[0]?.languageCode?.toLowerCase();
  return code === 'ar' ? 'ar' : 'en';
}

/**
 * Icons that point somewhere must mirror in RTL. Names that are direction
 * neutral are returned untouched.
 */
const MIRRORED_ICONS: Record<string, string> = {
  'chevron-forward': 'chevron-back',
  'chevron-back': 'chevron-forward',
  'chevron-forward-outline': 'chevron-back-outline',
  'chevron-back-outline': 'chevron-forward-outline',
  'arrow-forward': 'arrow-back',
  'arrow-back': 'arrow-forward',
  'arrow-forward-outline': 'arrow-back-outline',
  'arrow-back-outline': 'arrow-forward-outline',
  'arrow-undo': 'arrow-redo',
  'arrow-redo': 'arrow-undo',
  'caret-forward': 'caret-back',
  'caret-back': 'caret-forward',
  'play-forward': 'play-back',
  'play-back': 'play-forward',
  'return-down-forward': 'return-down-back',
  'return-down-back': 'return-down-forward',
  'exit-outline': 'enter-outline',
  'enter-outline': 'exit-outline',
};

export function mirrorIcon(name: string, isRTL: boolean): string {
  if (!isRTL) return name;
  return MIRRORED_ICONS[name] ?? name;
}
