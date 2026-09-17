import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconButton, Txt } from '@/components/ui';
import { formatAmount, formatCount } from '@/domain/format';
import { spacing, useTheme } from '@/theme';
import type { MealEntry } from '@/types';

import { useFoodLabels } from './useFoodLabels';

export interface EntryRowProps {
  entry: MealEntry;
  /** Shows a remove button when provided. */
  onRemove?: () => void;
  /** Uses millilitres instead of grams in the fallback portion label. */
  liquid?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * One line of a meal: what it is, how much of it, and what it costs.
 *
 * The description and the remove button are siblings, never nested, so the row
 * reads as a single item to assistive tech while the button stays its own
 * target. Nesting them would also emit a button inside a button on web.
 */
export function EntryRow({ entry, onRemove, liquid = false, style }: EntryRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation(['meals', 'units']);
  const labels = useFoodLabels();

  const portion = labels.portion(entry.servingLabel, entry.quantityGrams, liquid);
  const { macros } = entry;
  const calories = formatCount(Math.round(macros.calories));

  const summary =
    `${entry.name}, ${portion}, ${calories} ${t('units:caloriesLong')}. ` +
    `${labels.macroSpoken(macros)}.`;

  return (
    <View style={[styles.row, style]}>
      <View style={styles.main} accessible accessibilityLabel={summary}>
        <View style={styles.text}>
          <Txt weight="medium" numberOfLines={1}>
            {entry.name}
          </Txt>
          <Txt variant="caption" color="faint" numberOfLines={1} style={styles.portion}>
            {portion}
          </Txt>
        </View>

        <View style={styles.macros}>
          <View style={styles.energy}>
            <Txt variant="label" weight="bold" tabular numberOfLines={1}>
              {calories}
            </Txt>
            <Txt variant="caption" color="faint" style={styles.unit}>
              {t('units:kcal')}
            </Txt>
          </View>
          <View style={styles.split}>
            <Txt variant="caption" color={colors.protein} weight="medium" tabular>
              {`${t('meals:macroShortProtein')} ${formatAmount(macros.protein, 1)}`}
            </Txt>
            <Txt variant="caption" color={colors.carbs} weight="medium" tabular>
              {`${t('meals:macroShortCarbs')} ${formatAmount(macros.carbs, 1)}`}
            </Txt>
            <Txt variant="caption" color={colors.fat} weight="medium" tabular>
              {`${t('meals:macroShortFat')} ${formatAmount(macros.fat, 1)}`}
            </Txt>
          </View>
        </View>
      </View>

      {onRemove ? (
        <IconButton
          icon="close-circle"
          onPress={onRemove}
          accessibilityLabel={t('meals:reviewRemoveItem', { name: entry.name })}
          color={colors.textFaint}
          size={20}
          style={styles.remove}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 56,
    paddingStart: spacing.lg,
    paddingEnd: spacing.sm,
    paddingVertical: spacing.sm,
  },
  main: {
    alignItems: 'center',
    columnGap: spacing.md,
    flex: 1,
    flexDirection: 'row',
  },
  text: {
    flex: 1,
  },
  portion: {
    marginTop: 2,
  },
  macros: {
    alignItems: 'flex-end',
  },
  energy: {
    alignItems: 'baseline',
    columnGap: 3,
    flexDirection: 'row',
  },
  unit: {
    letterSpacing: 0.2,
  },
  split: {
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginTop: 2,
  },
  remove: {
    marginEnd: -spacing.xs,
  },
});
