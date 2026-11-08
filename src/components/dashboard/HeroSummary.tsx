import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Txt } from '@/components/ui';
import { formatCount } from '@/domain/format';
import { radius, spacing, useTheme } from '@/theme';

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

export interface HeroSummaryProps {
  /** Calories eaten today. */
  consumed: number;
  /** The day's calorie target, null until a profile exists. */
  targetCalories: number | null;
  /** Opens the profile setup when there is no target. */
  onSetUpProfile: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Where today stands against the calorie target.
 *
 * One figure, set large and quiet, with the day's progress under it. This is
 * the only place on the dashboard the accent is spent: everything below is a
 * detail behind this number.
 */
export function HeroSummary({ consumed, targetCalories, onSetUpProfile, style }: HeroSummaryProps) {
  const { t } = useTranslation('dashboard');
  const { colors } = useTheme();

  const target = targetCalories !== null && targetCalories > 0 ? targetCalories : null;
  const eaten = Math.max(0, Math.round(consumed));
  const remaining = target === null ? 0 : Math.round(target - eaten);
  const over = remaining < 0;
  const progress = target === null ? 0 : Math.min(1, Math.max(0, eaten / target));

  const figure = target === null ? eaten : Math.abs(remaining);
  const caption = target === null ? t('heroEatenToday') : over ? t('heroOver') : t('heroLeft');

  // Over the target is information, not an alarm: the bar changes tone, the
  // figure stays the same size and the same colour.
  const barColor = over ? colors.warning : colors.accent;

  return (
    <View style={style}>
      <Txt variant="label" color="muted" numberOfLines={1}>
        {t('heroToday')}
      </Txt>

      <View
        accessible
        accessibilityLabel={
          target === null
            ? `${formatCount(eaten)} ${caption}`
            : t('heroProgress', { eaten: formatCount(eaten), target: formatCount(target) })
        }
        style={styles.figureBlock}
      >
        {/* The figure and its caption stack rather than sit side by side: as
            siblings in a row Arabic reorders them and the two runs touch. */}
        <Txt variant="display" tabular numberOfLines={1} style={styles.figure}>
          {formatCount(figure)}
        </Txt>
        <Txt variant="label" color="muted" numberOfLines={1} style={styles.caption}>
          {caption}
        </Txt>
      </View>

      {target === null ? (
        <>
          <Txt color="muted" style={styles.note}>
            {t('heroNoTarget')}
          </Txt>
          <Button
            label={t('heroSetProfile')}
            onPress={onSetUpProfile}
            variant="secondary"
            size="sm"
            style={styles.action}
          />
        </>
      ) : (
        <>
          <View style={[styles.bar, { backgroundColor: colors.track }]} {...DECORATIVE}>
            <View
              style={[styles.barFill, { backgroundColor: barColor, width: `${progress * 100}%` }]}
            />
          </View>
          <Txt variant="caption" color="faint" tabular numberOfLines={1} style={styles.against}>
            {t('heroAgainst', { eaten: formatCount(eaten), target: formatCount(target) })}
          </Txt>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  figureBlock: {
    marginTop: spacing.xs,
  },
  figure: {
    // A figure never shrinks or wraps to fit.
    flexShrink: 0,
  },
  caption: {
    marginTop: spacing.xs,
  },
  note: {
    marginTop: spacing.md,
  },
  action: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
  },
  bar: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 6,
    marginTop: spacing.xl,
    overflow: 'hidden',
    width: '100%',
  },
  barFill: {
    height: '100%',
  },
  against: {
    marginTop: spacing.sm,
  },
});
