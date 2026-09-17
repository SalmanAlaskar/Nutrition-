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

import { fontSize, fontWeight, useTheme, type Palette } from '@/theme';

export type TxtVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';
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
  display: { fontSize: fontSize.display, lineHeight: 44, letterSpacing: -1.4 },
  title: { fontSize: fontSize.xxl, lineHeight: 34, letterSpacing: -0.7 },
  heading: { fontSize: fontSize.xl, lineHeight: 28, letterSpacing: -0.35 },
  body: { fontSize: fontSize.md, lineHeight: 21, letterSpacing: -0.1 },
  label: { fontSize: fontSize.sm, lineHeight: 18, letterSpacing: 0.1 },
  caption: { fontSize: fontSize.xs, lineHeight: 15, letterSpacing: 0.45 },
};

const VARIANT_WEIGHT: Record<TxtVariant, TxtWeight> = {
  display: 'bold',
  title: 'bold',
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
  const resolvedWeight = weight ?? VARIANT_WEIGHT[variant];

  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        styles.base,
        VARIANT_STYLE[variant],
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
