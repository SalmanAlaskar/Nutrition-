import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Txt, type TxtColor } from '@/components/ui';
import { formatAmount, formatDelta } from '@/domain/format';
import { radius, spacing, useTheme } from '@/theme';

import { TrendSpark } from './TrendSpark';

export interface MetricGridItem {
  /** Stable key, usually the scan field name. */
  key: string;
  /** Already translated. */
  label: string;
  /** Null when the reading did not carry this metric. */
  value: number | null;
  unit: string;
  decimals: number;
  /** Signed change since the previous reading, absent when there is none. */
  delta?: number;
  /**
   * True when the change went the way he is working towards, false when it did
   * not, null when the direction depends on the goal, as weight does.
   */
  better: boolean | null;
  /** Every reading that carries this metric, oldest first. */
  series: number[];
}

export interface MetricGridProps {
  items: MetricGridItem[];
  style?: StyleProp<ViewStyle>;
}

/** Stands in for a figure the sheet did not print. */
const MISSING = '—';

/** Below this the change is noise, not a direction. */
const FLAT = 0.05;

/**
 * The body numbers, two to a row: the figure, the change since the previous
 * reading and the shape of every reading behind it.
 *
 * The change is coloured by whether it went the wanted way, never by whether
 * it went up, so muscle gained and fat lost both read as progress.
 */
export function MetricGrid({ items, style }: MetricGridProps) {
  const { t } = useTranslation('dashboard');
  const { colors } = useTheme();

  return (
    <View style={[styles.grid, style]}>
      {items.map((item) => {
        const { delta } = item;
        const flat = delta !== undefined && Math.abs(delta) < FLAT;
        const tone: string =
          delta === undefined || flat || item.better === null
            ? colors.textFaint
            : item.better
              ? colors.accent
              : colors.warning;
        const deltaColor: TxtColor = tone;

        const change =
          delta === undefined
            ? t('deltaNone')
            : flat
              ? t('deltaFlat')
              : t(delta > 0 ? 'deltaUp' : 'deltaDown', {
                  amount: `${formatAmount(Math.abs(delta), item.decimals)} ${item.unit}`.trim(),
                });

        const spoken =
          item.value === null
            ? t('metricMissing', { label: item.label })
            : `${t('metricSpoken', {
                label: item.label,
                value: formatAmount(item.value, item.decimals),
                unit: item.unit,
              })}. ${change}`;

        return (
          <View
            key={item.key}
            accessible
            accessibilityLabel={spoken}
            style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Txt variant="caption" color="faint" weight="bold" numberOfLines={1}>
              {item.label.toUpperCase()}
            </Txt>

            <View style={styles.valueRow}>
              <Txt variant="title" weight="bold" tabular numberOfLines={1} style={styles.value}>
                {item.value === null ? MISSING : formatAmount(item.value, item.decimals)}
              </Txt>
              {item.unit ? (
                <Txt variant="caption" color="faint" weight="semibold" style={styles.unit}>
                  {item.unit}
                </Txt>
              ) : null}
            </View>

            <Txt variant="label" weight="semibold" color={deltaColor} tabular numberOfLines={1}>
              {delta === undefined ? MISSING : formatDelta(delta, item.decimals)}
            </Txt>

            <TrendSpark values={item.series} color={tone} style={styles.spark} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    columnGap: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
  },
  tile: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    // Two to a row at phone width, one when the label needs the space.
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 140,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  valueRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  value: {
    flexShrink: 1,
  },
  unit: {
    marginStart: spacing.xs,
  },
  spark: {
    marginTop: spacing.sm,
  },
});
