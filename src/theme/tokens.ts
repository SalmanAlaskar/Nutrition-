/**
 * Design tokens. Every colour, space and radius in the app comes from here.
 *
 * The language is restraint. Surfaces separate by tone rather than by outline,
 * the accent marks one thing per screen, state colours inform instead of alarm,
 * and space — not borders — does the grouping.
 */

export interface Palette {
  /** Screen background. */
  bg: string;
  /** Raised surface: cards, sheets, inputs. Reads as a tone, not as a box. */
  surface: string;
  /** Surface one step further forward: pressed states, chips. */
  surfaceAlt: string;
  /** Hairline borders and dividers. Deliberately almost invisible. */
  border: string;
  /** A line that has to be seen: a focused field, a rule under a header row. */
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Primary brand colour. One screen, one accent. */
  accent: string;
  accentText: string;
  accentSoft: string;
  protein: string;
  carbs: string;
  fat: string;
  danger: string;
  /** Low-saturation wash behind danger copy, so a warning never shouts. */
  dangerSoft: string;
  warning: string;
  /** Low-saturation wash behind warning copy. */
  warningSoft: string;
  success: string;
  /** Low-saturation wash behind success copy. */
  successSoft: string;
  /** Track colour behind progress rings and bars. */
  track: string;
  overlay: string;
}

/** The primary palette: deep neutral ink, one green, everything else quiet. */
export const darkPalette: Palette = {
  bg: '#0C1017',
  surface: '#141A23',
  surfaceAlt: '#1D2430',
  border: '#222935',
  borderStrong: '#303A49',
  text: '#EEF2F7',
  textMuted: '#98A3B2',
  textFaint: '#7A8492',
  accent: '#3DD68C',
  accentText: '#06241A',
  accentSoft: '#112A20',
  protein: '#6B9BF2',
  carbs: '#E8A94A',
  fat: '#EE8089',
  danger: '#E8737C',
  dangerSoft: '#2B1A1D',
  warning: '#D9A94E',
  warningSoft: '#2A2318',
  success: '#4FC894',
  successSoft: '#13291F',
  track: '#1E2531',
  overlay: 'rgba(4, 7, 12, 0.74)',
};

export const lightPalette: Palette = {
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EFF1F5',
  border: '#E4E7ED',
  borderStrong: '#CFD5DF',
  text: '#111821',
  textMuted: '#5B6572',
  textFaint: '#868F9C',
  accent: '#0E9C6B',
  accentText: '#FFFFFF',
  accentSoft: '#E3F3EB',
  protein: '#3366CC',
  carbs: '#B07A12',
  fat: '#CB5560',
  danger: '#C2454E',
  dangerSoft: '#FBE9EA',
  warning: '#A9780F',
  warningSoft: '#FAF0DC',
  success: '#10845C',
  successSoft: '#E1F1E9',
  track: '#E7EAF0',
  overlay: 'rgba(15, 22, 32, 0.42)',
};

/**
 * The step from `lg` upwards is deliberately steep: the gap between two
 * sections has to beat the gap inside one by enough that grouping reads
 * without a single border.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,
  xxl: 40,
  xxxl: 64,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/**
 * Screen rhythm. `sectionGap` is the one number that makes the app feel calm,
 * so it lives here rather than being retyped on every screen.
 */
export const layout = {
  /** Gutter from the screen edge to content. */
  gutter: 18,
  /**
   * The widest the content column ever gets. This is a phone app, and on a
   * laptop the same layout stretched across the whole window: full-width
   * segmented controls, and wheel pickers a metre wide.
   */
  maxContentWidth: 560,
  /** Space above the first thing on a screen. */
  screenTop: 8,
  /** Gap between two sections. Always larger than anything inside one. */
  sectionGap: 36,
  /** Gap between a section heading and its body. */
  headerGap: 14,
  /** Gap between sibling items inside a section. */
  itemGap: 12,
  /** Comfortable measure for a paragraph of copy. */
  maxTextWidth: 420,
  /** Smallest tap target the app ships. */
  minTarget: 44,
} as const;

/**
 * `metric` is the size a figure is read at. It sits clear of `heading` so a
 * value and its label never look like two of the same thing.
 */
export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 24,
  metric: 28,
  xxl: 30,
  display: 44,
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
