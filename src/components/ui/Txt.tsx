import React from 'react';
import {
  I18nManager,
  Platform,
  StyleSheet,
  Text,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { useDirection } from '@/i18n';
import { fontSize, fontWeight, useTheme, type Palette } from '@/theme';

/**
 * `metric` is the size a figure is read at: large, tight and quiet. It sits a
 * clear step above `heading` so a value never looks like a title.
 */
export type TxtVariant =
  | 'display'
  | 'title'
  | 'metric'
  | 'heading'
  | 'body'
  | 'label'
  | 'caption';
export type TxtWeight = 'regular' | 'medium' | 'semibold' | 'bold';
/**
 * 'start' and 'end' follow the reading direction and are what screens should
 * use. The physical 'left' and 'right' stay available for the rare case that
 * must not mirror, such as a number column pinned beside a chart axis.
 */
export type TxtAlign = 'start' | 'center' | 'end' | 'left' | 'right';
export type TxtColorName =
  | 'text'
  | 'muted'
  | 'faint'
  | 'accent'
  | 'danger'
  | 'success'
  | 'warning';
/** A named palette slot, or any raw colour string. */
export type TxtColor = TxtColorName | (string & {});

export interface TxtProps extends Omit<TextProps, 'style' | 'numberOfLines'> {
  variant?: TxtVariant;
  color?: TxtColor;
  weight?: TxtWeight;
  align?: TxtAlign;
  numberOfLines?: number;
  /** Locks digit width so a changing number never jitters. */
  tabular?: boolean;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

const COLOR_KEYS: Record<TxtColorName, keyof Palette> = {
  text: 'text',
  muted: 'textMuted',
  faint: 'textFaint',
  accent: 'accent',
  danger: 'danger',
  success: 'success',
  warning: 'warning',
};

/** Typed separately so the literal survives TextStyle's fontVariant union. */
export const tabularNums: TextStyle = { fontVariant: ['tabular-nums'] };

const VARIANT_STYLE: Record<TxtVariant, TextStyle> = {
  display: { fontSize: fontSize.display, lineHeight: 48, letterSpacing: -1.6 },
  title: { fontSize: fontSize.xxl, lineHeight: 36, letterSpacing: -0.8 },
  metric: { fontSize: fontSize.metric, lineHeight: 32, letterSpacing: -0.7 },
  heading: { fontSize: fontSize.lg + 2, lineHeight: 26, letterSpacing: -0.3 },
  body: { fontSize: fontSize.md, lineHeight: 22, letterSpacing: -0.1 },
  label: { fontSize: fontSize.sm, lineHeight: 19, letterSpacing: 0 },
  caption: { fontSize: fontSize.xs, lineHeight: 15, letterSpacing: 0.2 },
};

/**
 * Arabic is cursive: letter spacing opens gaps inside a joined word, and the
 * script carries taller ascenders and lower descenders than Latin. So the
 * tracking goes to zero and every line gets a little more air.
 */
const ARABIC_LEADING = 1.18;

const VARIANT_STYLE_AR: Record<TxtVariant, TextStyle> = Object.fromEntries(
  (Object.keys(VARIANT_STYLE) as TxtVariant[]).map((key) => {
    const base = VARIANT_STYLE[key];
    return [
      key,
      {
        fontSize: base.fontSize,
        lineHeight: Math.round((base.lineHeight ?? 0) * ARABIC_LEADING),
        letterSpacing: 0,
      },
    ];
  }),
) as Record<TxtVariant, TextStyle>;

const VARIANT_WEIGHT: Record<TxtVariant, TxtWeight> = {
  display: 'bold',
  title: 'bold',
  metric: 'semibold',
  heading: 'semibold',
  body: 'regular',
  label: 'medium',
  caption: 'medium',
};

function resolveColor(palette: Palette, value: TxtColor): string {
  const key = COLOR_KEYS[value as TxtColorName];
  return key ? palette[key] : value;
}

/**
 * React Native's textAlign has no logical values, while react-native-web does
 * and flips them from `dir`. So the web keeps 'start' / 'end' and native
 * resolves them against I18nManager once, at style time.
 */
function alignStyle(align: TxtAlign | undefined): TextStyle | null {
  if (!align) return null;
  if (align !== 'start' && align !== 'end') return { textAlign: align };
  if (Platform.OS === 'web') {
    return { textAlign: align as unknown as TextStyle['textAlign'] };
  }
  const rtl = I18nManager.isRTL;
  if (align === 'start') return { textAlign: rtl ? 'right' : 'left' };
  return { textAlign: rtl ? 'left' : 'right' };
}

export function Txt({
  variant = 'body',
  color = 'text',
  weight,
  align,
  numberOfLines,
  tabular,
  style,
  children,
  ...rest
}: TxtProps) {
  const { colors } = useTheme();
  const { language } = useDirection();
  const resolvedWeight = weight ?? VARIANT_WEIGHT[variant];
  const metrics = language === 'ar' ? VARIANT_STYLE_AR[variant] : VARIANT_STYLE[variant];

  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        styles.base,
        metrics,
        { color: resolveColor(colors, color), fontWeight: fontWeight[resolvedWeight] },
        alignStyle(align),
        tabular ? tabularNums : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});
