import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { Txt } from './Txt';

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

/** A badge carrying a figure gets locked digit widths so a row never jitters. */
const HAS_DIGIT = /\d/;

export type BadgeTone = 'default' | 'accent' | 'danger' | 'warning' | 'success';
/**
 * 'soft' is a low-saturation wash. 'plain' drops the wash entirely and lets the
 * word carry the state, which is usually enough.
 */
export type BadgeVariant = 'soft' | 'plain';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  variant?: BadgeVariant;
  /** A small tone-coloured dot before the label. Reads as state without a fill. */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, tone = 'default', variant = 'soft', dot = false, style }: BadgeProps) {
  const { colors } = useTheme();

  const foreground =
    tone === 'accent'
      ? colors.accent
      : tone === 'danger'
        ? colors.danger
        : tone === 'warning'
          ? colors.warning
          : tone === 'success'
            ? colors.success
            : colors.textMuted;

  const wash =
    tone === 'accent'
      ? colors.accentSoft
      : tone === 'danger'
        ? colors.dangerSoft
        : tone === 'warning'
          ? colors.warningSoft
          : tone === 'success'
            ? colors.successSoft
            : colors.surfaceAlt;

  return (
    <View
      style={[
        styles.badge,
        variant === 'soft'
          ? [styles.washed, { backgroundColor: wash }]
          : null,
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: foreground }]} {...DECORATIVE} /> : null}
      {/* No uppercase and no tracking: Arabic has neither, and the word is calmer without. */}
      <Txt
        variant="caption"
        weight="semibold"
        color={foreground}
        numberOfLines={1}
        tabular={HAS_DIGIT.test(label)}
      >
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    columnGap: spacing.xs + 1,
    flexDirection: 'row',
  },
  washed: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  dot: {
    borderRadius: radius.pill,
    height: 6,
    width: 6,
  },
});
