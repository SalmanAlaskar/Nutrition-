import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ProgressRing, Txt } from '@/components/ui';
import { formatCount } from '@/domain/format';
import { spacing, useTheme } from '@/theme';

export interface AdherenceRingProps {
  /** Days that landed inside the band around the calorie target. */
  hit: number;
  /** Days with at least one meal logged in the window. */
  logged: number;
  /** Half-width of the band, as a percentage of the target. */
  band: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_SIZE = 104;
const STROKE = 7;

/**
 * How many logged days landed near the calorie target, as one ring with its
 * sentence beside it.
 *
 * The denominator is days that were logged, not days in the window, so a quiet
 * week reads as a small sample rather than as a failure. The arc is drawn in
 * ink rather than the accent: the accent belongs to the figure at the top of
 * the screen and to nothing else.
 */
export function AdherenceRing({
  hit,
  logged,
  band,
  size = DEFAULT_SIZE,
  style,
}: AdherenceRingProps) {
  const { t } = useTranslation('dashboard');
  const { colors } = useTheme();

  const progress = logged > 0 ? hit / logged : 0;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('adherenceSpoken', { hit, logged, band })}
      style={[styles.row, style]}
    >
      <ProgressRing
        size={size}
        strokeWidth={STROKE}
        progress={progress}
        color={colors.text}
        trackColor={colors.track}
      >
        <Txt variant="metric" tabular numberOfLines={1}>
          {formatCount(hit)}
        </Txt>
        {/* A fraction rule, so the smaller figure reads as the denominator
            rather than as a second, unrelated number. */}
        <View style={[styles.rule, { backgroundColor: colors.borderStrong }]} />
        <Txt variant="caption" color="faint" tabular numberOfLines={1}>
          {formatCount(logged)}
        </Txt>
      </ProgressRing>

      <Txt variant="label" color="muted" numberOfLines={4} style={styles.caption}>
        {t('adherenceCaption', { band })}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    columnGap: spacing.lg,
    flexDirection: 'row',
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 3,
    width: 22,
  },
  caption: {
    flexShrink: 1,
  },
});
