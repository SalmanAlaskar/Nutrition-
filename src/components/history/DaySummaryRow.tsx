import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Txt } from '@/components/ui';
import { formatDayLabel } from '@/domain/date';
import { radius, spacing, useTheme } from '@/theme';
import type { Macros } from '@/types';

import { formatCount } from '../../../app/onboarding/_layout';

export interface DaySummaryRowProps {
  /** Local calendar day, 'YYYY-MM-DD'. */
  date: string;
  macros: Macros;
  mealCount: number;
  /** 0 when no profile exists yet; the comparison is then hidden. */
  targetCalories: number;
  onPress: (date: string) => void;
  style?: StyleProp<ViewStyle>;
}

/** Decoration is hidden from assistive tech; the prop differs per platform. */
const DECORATIVE = Platform.select({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants' as const,
  },
});

function MacroPart({ letter, grams, color }: { letter: string; grams: number; color: string }) {
  return (
    <View style={styles.macroPart}>
      <Txt variant="caption" weight="bold" color={color}>
        {letter}
      </Txt>
      <Txt variant="label" color="muted" tabular style={styles.macroValue}>
        {formatCount(grams)}
      </Txt>
      <Txt variant="caption" color="faint" style={styles.macroUnit}>
        g
      </Txt>
    </View>
  );
}

/** One day in the history list. Tapping it opens that day on the Today tab. */
export function DaySummaryRow({
  date,
  macros,
  mealCount,
  targetCalories,
  onPress,
  style,
}: DaySummaryRowProps) {
  const { colors } = useTheme();

  const calories = Math.round(macros.calories);
  const hasTarget = targetCalories > 0;
  const over = hasTarget && calories > targetCalories;
  const difference = Math.abs(calories - targetCalories);

  // The track is scaled to whichever is larger, so an overshoot is drawn past
  // the target notch instead of silently pinning the bar at full width.
  const denominator = Math.max(calories, targetCalories, 1);
  const underShare = Math.min(calories, targetCalories) / denominator;
  const overShare = over ? (calories - targetCalories) / denominator : 0;

  const meals = `${mealCount} ${mealCount === 1 ? 'meal' : 'meals'}`;
  const comparison = !hasTarget
    ? ''
    : over
      ? `${formatCount(difference)} over target`
      : difference === 0
        ? 'on target'
        : `${formatCount(difference)} under target`;

  const label = hasTarget
    ? `${formatDayLabel(date)}: ${formatCount(calories)} of ${formatCount(
        targetCalories,
      )} kilocalories, ${comparison}. ${meals}.`
    : `${formatDayLabel(date)}: ${formatCount(calories)} kilocalories. ${meals}.`;

  return (
    <Pressable
      onPress={() => onPress(date)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens this day on the Today tab"
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.surfaceAlt } : null,
        style,
      ]}
    >
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.dayBlock}>
            <Txt weight="semibold" numberOfLines={1}>
              {formatDayLabel(date)}
            </Txt>
            <Txt variant="caption" color="faint" numberOfLines={1} style={styles.meals}>
              {meals}
            </Txt>
          </View>

          <View style={styles.calories}>
            <Txt variant="heading" weight="bold" color={over ? colors.warning : colors.text} tabular>
              {formatCount(calories)}
            </Txt>
            <Txt variant="label" color="faint" tabular style={styles.caloriesUnit}>
              {hasTarget ? `/ ${formatCount(targetCalories)} kcal` : 'kcal'}
            </Txt>
          </View>
        </View>

        {hasTarget ? (
          <View style={[styles.track, { backgroundColor: colors.track }]} {...DECORATIVE}>
            <View
              style={[
                styles.fill,
                { backgroundColor: colors.accent, width: `${underShare * 100}%` },
              ]}
            />
            {over ? (
              <View
                style={[
                  styles.fill,
                  styles.overflow,
                  {
                    backgroundColor: colors.warning,
                    borderLeftColor: colors.surface,
                    width: `${overShare * 100}%`,
                  },
                ]}
              />
            ) : null}
          </View>
        ) : null}

        <View style={styles.foot}>
          <View style={styles.macros}>
            <MacroPart letter="P" grams={macros.protein} color={colors.protein} />
            <MacroPart letter="C" grams={macros.carbs} color={colors.carbs} />
            <MacroPart letter="F" grams={macros.fat} color={colors.fat} />
          </View>
          {comparison ? (
            <Txt
              variant="caption"
              color={over ? 'warning' : 'faint'}
              numberOfLines={1}
              style={styles.comparison}
            >
              {comparison}
            </Txt>
          ) : null}
        </View>
      </View>

      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.textFaint}
        style={styles.chevron}
        {...DECORATIVE}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  body: {
    flexGrow: 1,
    flexShrink: 1,
    rowGap: spacing.sm,
  },
  head: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayBlock: {
    flexShrink: 1,
  },
  meals: {
    marginTop: 2,
  },
  calories: {
    alignItems: 'baseline',
    columnGap: spacing.xs + 1,
    flexDirection: 'row',
    flexShrink: 0,
  },
  caloriesUnit: {
    marginBottom: 1,
  },
  track: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
  },
  overflow: {
    borderLeftWidth: 1.5,
  },
  foot: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macros: {
    columnGap: spacing.lg,
    flexDirection: 'row',
    flexShrink: 1,
  },
  macroPart: {
    alignItems: 'baseline',
    flexDirection: 'row',
  },
  macroValue: {
    marginStart: spacing.xs + 1,
  },
  macroUnit: {
    marginStart: 2,
  },
  comparison: {
    flexShrink: 0,
  },
  chevron: {
    marginStart: spacing.md,
  },
});
