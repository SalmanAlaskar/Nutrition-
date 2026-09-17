import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Polyline,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { Button, EmptyState, Txt } from '@/components/ui';
import { daysBetween } from '@/domain/date';
import { formatAmount } from '@/domain/format';
import { kgToLb } from '@/domain/nutrition';
import { useDirection } from '@/i18n';
import { fontSize, radius, spacing, useTheme } from '@/theme';
import type { UnitSystem, WeightLog } from '@/types';

import { useDayText } from './dayText';

export interface WeightChartProps {
  /** Logs inside the visible range, oldest first. */
  logs: WeightLog[];
  /** First and last day of the range, 'YYYY-MM-DD'. */
  startDate: string;
  endDate: string;
  units: UnitSystem;
  /** Opens the weight entry sheet. */
  onLogWeight: () => void;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT = 140;
const TOP = 14;
const BOTTOM = HEIGHT - 14;
const GUTTER = 44;
const RIGHT_INSET = 8;
/** Below three points a line says more than the data supports. */
const MIN_TREND_POINTS = 3;
const AREA_FILL_ID = 'weightChartArea';

/** Decoration is hidden from assistive tech; the prop differs per platform. */
const DECORATIVE = Platform.select({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants' as const,
  },
});

/**
 * Body weight over the range. Three or more weigh-ins draw a trend line; fewer
 * are shown as the readings themselves, which is all the data supports.
 */
export function WeightChart({
  logs,
  startDate,
  endDate,
  units,
  onLogWeight,
  style,
}: WeightChartProps) {
  const { colors } = useTheme();
  const { t } = useTranslation(['history', 'units']);
  const { isRTL } = useDirection();
  const dayText = useDayText();
  const [width, setWidth] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => (current === next ? current : next));
  }, []);

  const unitLabel = units === 'imperial' ? t('units:lb') : t('units:kg');
  const toDisplay = useCallback(
    (kg: number) => (units === 'imperial' ? kgToLb(kg) : Math.round(kg * 10) / 10),
    [units],
  );

  const reading = useMemo(() => {
    const values = logs.map((log) => toDisplay(log.weightKg));
    const first = values[0] ?? 0;
    const current = values[values.length - 1] ?? 0;
    const delta = Math.round((current - first) * 10) / 10;
    return {
      values,
      first,
      current,
      delta,
      steady: Math.abs(delta) < 0.05,
      firstDate: logs[0]?.date ?? startDate,
      lastDate: logs[logs.length - 1]?.date ?? endDate,
    };
  }, [logs, toDisplay, startDate, endDate]);

  const model = useMemo(() => {
    const values = reading.values;
    const lowest = values.length > 0 ? Math.min(...values) : 0;
    const highest = values.length > 0 ? Math.max(...values) : 0;
    const span = highest - lowest;
    const pad = span < 0.2 ? 0.5 : span * 0.15;
    const lo = lowest - pad;
    const hi = highest + pad;

    const daySpan = Math.max(1, daysBetween(startDate, endDate));
    const plotWidth = Math.max(0, width - GUTTER - RIGHT_INSET);
    const plotHeight = BOTTOM - TOP;

    const y = (value: number) => BOTTOM - ((value - lo) / (hi - lo)) * plotHeight;
    const points = logs.map((log, index) => {
      const fraction = Math.min(1, Math.max(0, daysBetween(startDate, log.date) / daySpan));
      return {
        key: log.id,
        x: GUTTER + fraction * plotWidth,
        y: y(values[index] ?? lowest),
      };
    });

    return {
      lowest,
      highest,
      flat: highest - lowest < 0.05,
      yHigh: y(highest),
      yLow: y(lowest),
      points,
      polyline: points.map((point) => `${point.x},${point.y}`).join(' '),
      area:
        points.length > 1
          ? `M ${points[0]?.x ?? GUTTER} ${BOTTOM} ${points
              .map((point) => `L ${point.x} ${point.y}`)
              .join(' ')} L ${points[points.length - 1]?.x ?? GUTTER} ${BOTTOM} Z`
          : '',
    };
  }, [logs, reading.values, startDate, endDate, width]);

  if (logs.length === 0) {
    return (
      <EmptyState
        icon="scale-outline"
        title={t('weightEmptyTitle')}
        message={t('weightEmptyMessage')}
        actionLabel={t('logWeight')}
        onAction={onLogWeight}
        style={style}
      />
    );
  }

  const directionIcon = reading.steady ? 'remove' : reading.delta < 0 ? 'arrow-down' : 'arrow-up';
  const sparse = logs.length < MIN_TREND_POINTS;
  const firstDay = dayText.shortDay(reading.firstDate);
  const lastDay = dayText.shortDay(reading.lastDate);

  const changeSummary = reading.steady
    ? t('changeNone', { date: firstDay })
    : t(reading.delta < 0 ? 'changeDown' : 'changeUp', {
        amount: formatAmount(Math.abs(reading.delta)),
        unit: unitLabel,
        date: firstDay,
      });

  const summary =
    logs.length === 1
      ? t('weightSpokenOne', {
          value: formatAmount(reading.current),
          unit: unitLabel,
          date: lastDay,
        })
      : t('weightSpoken', {
          value: formatAmount(reading.current),
          unit: unitLabel,
          date: lastDay,
          change: changeSummary,
        });

  const callout = (
    <View style={styles.callout}>
      <View style={styles.currentBlock}>
        <Txt variant="caption" color="faint" weight="semibold" numberOfLines={1}>
          {t('current').toUpperCase()}
        </Txt>
        <View style={styles.currentRow}>
          <Txt variant="title" tabular>
            {formatAmount(reading.current)}
          </Txt>
          <Txt variant="label" color="faint" weight="medium" style={styles.unit}>
            {unitLabel}
          </Txt>
        </View>
        <Txt variant="caption" color="faint" numberOfLines={1}>
          {t('loggedOn', { day: dayText.dayLabel(reading.lastDate) })}
        </Txt>
      </View>

      <View style={styles.deltaBlock}>
        <Txt variant="caption" color="faint" weight="semibold" align="end" numberOfLines={1}>
          {t('change').toUpperCase()}
        </Txt>
        {logs.length === 1 ? (
          <>
            <Txt variant="heading" weight="bold" color="muted" align="end">
              {t('firstEntry')}
            </Txt>
            <Txt variant="caption" color="faint" align="end" numberOfLines={1}>
              {t('nothingToCompare')}
            </Txt>
          </>
        ) : (
          <>
            <View style={styles.deltaRow}>
              <Ionicons
                name={directionIcon}
                size={15}
                color={colors.textMuted}
                {...DECORATIVE}
              />
              <Txt variant="heading" weight="bold" tabular numberOfLines={1}>
                {reading.steady
                  ? t('noChange')
                  : `${formatAmount(Math.abs(reading.delta))} ${unitLabel}`}
              </Txt>
            </View>
            <Txt variant="caption" color="faint" align="end" numberOfLines={1}>
              {reading.steady
                ? t('since', { date: firstDay })
                : t(reading.delta < 0 ? 'downSince' : 'upSince', { date: firstDay })}
            </Txt>
          </>
        )}
      </View>
    </View>
  );

  if (sparse) {
    return (
      <View style={style}>
        {callout}

        <View style={[styles.readings, { borderColor: colors.border }]}>
          {logs.map((log, index) => {
            const last = index === logs.length - 1;
            return (
              <View key={log.id} style={styles.readingRow}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: last ? colors.accent : colors.border },
                  ]}
                  {...DECORATIVE}
                />
                <Txt
                  variant="label"
                  color={last ? 'text' : 'muted'}
                  numberOfLines={1}
                  style={styles.readingDay}
                >
                  {dayText.dayLabel(log.date)}
                </Txt>
                <Txt variant="label" weight={last ? 'semibold' : 'regular'} tabular>
                  {`${formatAmount(toDisplay(log.weightKg))} ${unitLabel}`}
                </Txt>
              </View>
            );
          })}
        </View>

        <Txt variant="caption" color="faint" style={styles.sparseHint}>
          {logs.length === 1 ? t('sparseOne') : t('sparseTwo')}
        </Txt>

        <Button
          label={t('logWeight')}
          onPress={onLogWeight}
          variant="secondary"
          size="sm"
          style={styles.sparseAction}
        />
      </View>
    );
  }

  const showDots = model.points.length <= 16;

  return (
    <View style={style}>
      {callout}

      <View
        onLayout={handleLayout}
        style={[styles.plot, { height: HEIGHT }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={summary}
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <LinearGradient id={AREA_FILL_ID} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.accent} stopOpacity={0.22} />
                <Stop offset="1" stopColor={colors.accent} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>

            <Line
              x1={GUTTER}
              x2={width - RIGHT_INSET}
              y1={model.yHigh}
              y2={model.yHigh}
              stroke={colors.border}
              strokeWidth={1}
              strokeDasharray="4 5"
            />
            <SvgText x={0} y={model.yHigh - 5} fill={colors.textFaint} fontSize={fontSize.xs}>
              {formatAmount(model.highest)}
            </SvgText>

            {model.flat ? null : (
              <>
                <Line
                  x1={GUTTER}
                  x2={width - RIGHT_INSET}
                  y1={model.yLow}
                  y2={model.yLow}
                  stroke={colors.border}
                  strokeWidth={1}
                  strokeDasharray="4 5"
                />
                <SvgText x={0} y={model.yLow + 13} fill={colors.textFaint} fontSize={fontSize.xs}>
                  {formatAmount(model.lowest)}
                </SvgText>
              </>
            )}

            {model.area ? <Path d={model.area} fill={`url(#${AREA_FILL_ID})`} /> : null}

            <Polyline
              points={model.polyline}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {model.points.map((point, index) => {
              const last = index === model.points.length - 1;
              if (!showDots && !last) return null;
              return (
                <React.Fragment key={point.key}>
                  {last ? (
                    <Circle
                      cx={point.x}
                      cy={point.y}
                      r={8}
                      fill={colors.accent}
                      fillOpacity={0.18}
                    />
                  ) : null}
                  <Circle
                    cx={point.x}
                    cy={point.y}
                    r={last ? 4.5 : 2.5}
                    fill={last ? colors.accent : colors.bg}
                    stroke={colors.accent}
                    strokeWidth={last ? 0 : 2}
                  />
                </React.Fragment>
              );
            })}
          </Svg>
        ) : null}
      </View>

      {/*
        Time runs oldest to newest across the plot in both languages, so the
        axis keeps the same physical order as the line above it.
      */}
      <View style={[styles.axis, isRTL ? styles.axisRtl : null]} {...DECORATIVE}>
        <Txt variant="caption" color="faint">
          {dayText.shortDay(startDate)}
        </Txt>
        <Txt variant="caption" color="faint">
          {dayText.shortDay(endDate)}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  callout: {
    alignItems: 'flex-start',
    columnGap: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  currentBlock: {
    flexShrink: 1,
    rowGap: 2,
  },
  currentRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
  },
  unit: {
    marginStart: spacing.xs + 1,
  },
  deltaBlock: {
    alignItems: 'flex-end',
    flexShrink: 1,
    rowGap: 2,
  },
  deltaRow: {
    alignItems: 'center',
    columnGap: spacing.xs,
    flexDirection: 'row',
  },
  plot: {
    marginTop: spacing.md,
    width: '100%',
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: GUTTER,
    paddingRight: RIGHT_INSET,
  },
  axisRtl: {
    flexDirection: 'row-reverse',
  },
  readings: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    rowGap: spacing.sm,
  },
  readingRow: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    minHeight: 24,
  },
  dot: {
    borderRadius: radius.pill,
    height: 6,
    width: 6,
  },
  readingDay: {
    flexGrow: 1,
    flexShrink: 1,
  },
  sparseHint: {
    marginTop: spacing.md,
  },
  sparseAction: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
  },
});
