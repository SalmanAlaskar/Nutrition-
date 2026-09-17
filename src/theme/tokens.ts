/** Design tokens. Every colour, space and radius in the app comes from here. */

export interface Palette {
  /** Screen background. */
  bg: string;
  /** Raised surface: cards, sheets, inputs. */
  surface: string;
  /** Surface one step further forward: pressed states, chips. */
  surfaceAlt: string;
  /** Hairline borders and dividers. */
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Primary brand colour, used for the main action and calorie ring. */
  accent: string;
  accentText: string;
  accentSoft: string;
  protein: string;
  carbs: string;
  fat: string;
  danger: string;
  warning: string;
  success: string;
  /** Track colour behind progress rings and bars. */
  track: string;
  overlay: string;
}

export const darkPalette: Palette = {
  bg: '#0B1220',
  surface: '#141E33',
  surfaceAlt: '#1D2B47',
  border: '#24334F',
  text: '#F3F6FC',
  textMuted: '#9AABC9',
  textFaint: '#6B7E9E',
  accent: '#3DD68C',
  accentText: '#06251A',
  accentSoft: '#12332A',
  protein: '#5B8DEF',
  carbs: '#F5A524',
  fat: '#F2707B',
  danger: '#F2545B',
  warning: '#F5A524',
  success: '#3DD68C',
  track: '#22314D',
  overlay: 'rgba(5, 10, 20, 0.72)',
};

export const lightPalette: Palette = {
  bg: '#F5F7FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF2F9',
  border: '#DCE3EE',
  text: '#0F1B2E',
  textMuted: '#55668A',
  textFaint: '#8494B1',
  accent: '#12A971',
  accentText: '#FFFFFF',
  accentSoft: '#DCF5EA',
  protein: '#2F6BD8',
  carbs: '#C97A06',
  fat: '#D94854',
  danger: '#D93B45',
  warning: '#C97A06',
  success: '#12A971',
  track: '#E3E9F3',
  overlay: 'rgba(15, 27, 46, 0.45)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 28,
  display: 40,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Macro key -> palette key, so charts and legends never disagree. */
export const macroColorKey = {
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
} as const;
