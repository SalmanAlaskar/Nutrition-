import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { Txt } from './Txt';

/** A badge carrying a figure gets locked digit widths so a row never jitters. */
const HAS_DIGIT = /\d/;

export type BadgeTone = 'default' | 'accent' | 'danger' | 'warning' | 'success';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, tone = 'default', style }: BadgeProps) {
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

  const background = tone === 'accent' ? colors.accentSoft : colors.surfaceAlt;

  return (
    <View style={[styles.badge, { backgroundColor: background }, style]}>
      <Txt
        variant="caption"
        weight="bold"
        color={foreground}
        numberOfLines={1}
        tabular={HAS_DIGIT.test(label)}
        style={styles.label}
      >
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  label: {
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
