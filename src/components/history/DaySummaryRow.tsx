import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Txt } from '@/components/ui';
import { formatCount } from '@/domain/format';
import { layout, spacing, useTheme } from '@/theme';
import type { Macros } from '@/types';

import { useDayText } from './dayText';

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

/**
 * One macro as a single text run: the letter, the grams and the unit. Rendered
 * as siblings, Arabic reorders them and the figure collides with its unit.
 */
function MacroPart({
  letter,
  grams,
  unit,
  color,
}: {
  letter: string;
  grams: number;
  unit: string;
  color: string;
}) {
  return (
    <Txt variant="label" color="muted" tabular numberOfLines={1}>
      <Txt variant="label" weight="semibold" color={color}>
        {letter}
      </Txt>
      {` ${formatCount(grams)} ${unit}`}
    </Txt>
  );
}

/**
 * One day in the history list, read as two lines of text rather than a card:
 * the day with what it cost, then the macros with how it compared. Tapping it
 * opens that day on the Today tab.
 */
export function DaySummaryRow({
  date,
  macros,
  mealCount,
  targetCalories,
  onPress,
  style,
}: DaySummaryRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation(['history', 'units']);
  const dayText = useDayText();

  const calories = Math.round(macros.calories);
  const hasTarget = targetCalories > 0;
  const over = hasTarget && calories > targetCalories;
  const difference = Math.abs(calories - targetCalories);

  const gramUnit = t('units:gram');
  const day = dayText.dayLabel(date);
  const meals = mealCount === 1 ? t('mealsOne') : t('meals', { value: formatCount(mealCount) });
  const comparison = !hasTarget
    ? ''
    : over
      ? t('overTarget', { amount: formatCount(difference) })
      : difference === 0
        ? t('onTarget')
        : t('underTarget', { amount: formatCount(difference) });

  const label = hasTarget
    ? t('daySpokenRow', {
        day,
        eaten: formatCount(calories),
        target: formatCount(targetCalories),
        comparison,
        meals,
      })
    : t('daySpokenRowPlain', { day, eaten: formatCount(calories), meals });

  return (
    <Pressable
      onPress={() => onPress(date)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('openDay')}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.surfaceAlt } : null,
        style,
      ]}
    >
      <View style={styles.head}>
        <Txt numberOfLines={1} style={styles.day}>
          {day}
          <Txt variant="label" color="faint">{` · ${meals}`}</Txt>
        </Txt>

        {/* Eaten and target in one run: a slash between digits keeps their order. */}
        <Txt weight="semibold" tabular numberOfLines={1} style={styles.calories}>
          {formatCount(calories)}
          <Txt variant="label" color="faint" weight="regular">
            {hasTarget
              ? ` ${t('targetSuffix', { target: formatCount(targetCalories) })}`
              : ` ${t('units:kcal')}`}
          </Txt>
        </Txt>
      </View>

      <View style={styles.foot}>
        <View style={styles.macros}>
          <MacroPart
            letter={t('macroInitialProtein')}
            grams={macros.protein}
            unit={gramUnit}
            color={colors.protein}
          />
          <MacroPart
            letter={t('macroInitialCarbs')}
            grams={macros.carbs}
            unit={gramUnit}
            color={colors.carbs}
          />
          <MacroPart
            letter={t('macroInitialFat')}
            grams={macros.fat}
            unit={gramUnit}
            color={colors.fat}
          />
        </View>

        {comparison ? (
          <Txt
            variant="label"
            color={over ? 'muted' : 'faint'}
            tabular
            numberOfLines={1}
            style={styles.comparison}
          >
            {comparison}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    justifyContent: 'center',
    minHeight: layout.minTarget,
    paddingVertical: spacing.md,
    rowGap: spacing.xs + 2,
  },
  head: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  day: {
    flexShrink: 1,
  },
  calories: {
    flexShrink: 0,
  },
  foot: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macros: {
    columnGap: spacing.lg,
    flexDirection: 'row',
    flexShrink: 1,
    flexWrap: 'wrap',
    rowGap: 2,
  },
  comparison: {
    flexShrink: 0,
  },
});
