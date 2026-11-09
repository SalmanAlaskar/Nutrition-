import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Divider, Txt, type TxtColor } from '@/components/ui';
import { formatCount, formatDelta } from '@/domain/format';
import { spacing } from '@/theme';

/**
 * Mean length of a month. A rate per month is the only way a five-month gap
 * and a three-week gap compare fairly.
 */
const DAYS_PER_MONTH = 30.44;

export interface ProgressRateMetric {
  key: string;
  label: string;
  /** Signed change over the span. */
  delta: number;
  decimals: number;
  /** Already translated; empty for a bare index such as the score. */
  unit: string;
  /** Direction of a good change, null when it depends on the goal. */
  higherIsBetter: boolean | null;
}

export interface ProgressRateProps {
  /** Heading for the span, e.g. 'Since the previous reading, 18 Jun'. */
  title: string;
  /** Calendar days the span covers. */
  days: number;
  metrics: ProgressRateMetric[];
  style?: StyleProp<ViewStyle>;
}

/**
 * What moved across one span, and how fast. The raw change answers "what
 * happened"; the rate per month answers "was that quick", which the raw change
 * cannot when the two spans either side of it are 19 days and five months.
 */
export function ProgressRate({ title, days, metrics, style }: ProgressRateProps) {
  const { t } = useTranslation('profile');

  if (metrics.length === 0) return null;

  const span = days === 1 ? t('progressDaysOne') : t('progressDays', { days: formatCount(days) });

  return (
    <View style={style}>
      <View style={styles.head}>
        <Txt variant="label" weight="semibold" numberOfLines={2} style={styles.title}>
          {title}
        </Txt>
        <Txt variant="caption" color="faint" numberOfLines={1}>
          {span}
        </Txt>
      </View>

      {metrics.map((metric, index) => {
        const rate = days > 0 ? (metric.delta / days) * DAYS_PER_MONTH : 0;
        const change = `${formatDelta(metric.delta, metric.decimals)}${
          metric.unit ? ` ${metric.unit}` : ''
        }`;
        const perMonth = `${formatDelta(rate, metric.decimals)}${
          metric.unit ? ` ${metric.unit}` : ''
        } ${t('progressPerMonth')}`;
        const better =
          metric.delta === 0 || metric.higherIsBetter === null
            ? null
            : metric.delta > 0 === metric.higherIsBetter;
        const color: TxtColor = better === null ? 'text' : better ? 'success' : 'warning';

        return (
          <View key={metric.key}>
            {index > 0 ? <Divider /> : null}
            <View
              accessible
              accessibilityLabel={t('progressSpoken', {
                label: metric.label,
                change,
                rate: perMonth,
              })}
              style={styles.row}
            >
              <Txt numberOfLines={1} style={styles.label}>
                {metric.label}
              </Txt>

              {/* Figure, unit and rate stay inside one run each: as siblings
                  Arabic reorders them and two numbers collide into one. */}
              <Txt color={color} tabular numberOfLines={1} align="end" style={styles.delta}>
                {formatDelta(metric.delta, metric.decimals)}
                {metric.unit ? (
                  <Txt variant="label" color="faint">
                    {` ${metric.unit}`}
                  </Txt>
                ) : null}
              </Txt>

              <Txt
                variant="label"
                color="muted"
                tabular
                numberOfLines={1}
                align="end"
                style={styles.rate}
              >
                {formatDelta(rate, metric.decimals)}
                <Txt variant="caption" color="faint">
                  {` ${t('progressPerMonth')}`}
                </Txt>
              </Txt>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    alignItems: 'baseline',
    columnGap: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: {
    flexShrink: 1,
  },
  row: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 34,
    paddingVertical: spacing.sm,
  },
  label: {
    flex: 1,
  },
  delta: {
    flexShrink: 0,
  },
  rate: {
    flexShrink: 0,
    minWidth: 86,
  },
});
