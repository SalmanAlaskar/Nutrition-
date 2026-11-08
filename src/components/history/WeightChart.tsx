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
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { Button, EmptyState, Txt } from '@/components/ui';
import { daysBetween } from '@/domain/date';
import { formatAmount } from '@/domain/format';
import { kgToLb } from '@/domain/nutrition';
import { useDirection } from '@/i18n';
import { fontSize, layout, radius, spacing, useTheme } from '@/theme';
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
/** Thin enough to read as a measurement rather than as a ribbon. */
const LINE_WIDTH = 1.5;

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
 * are shown as the readings themselves, which is all the data supports. The
 * line is drawn in ink: on this screen the accent belongs to the calorie bars.
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

  /**
   * The figure leads, its change sits beside it in words. Every unit is nested
   * in the run that carries its number: as siblings, Arabic reorders them.
   */
  const callout = (
    <View style={styles.callout}>
      <View style={styles.currentBlock}>
        <Txt variant="label" color="muted" numberOfLines={1}>
          {t('current')}
        </Txt>
        <Txt variant="metric" tabular numberOfLines={1} style={styles.currentValue}>
          {formatAmount(reading.current)}
          <Txt variant="label" color="faint" weight="medium">
            {` ${unitLabel}`}
          </Txt>
        </Txt>
        <Txt variant="caption" color="faint" numberOfLines={1}>
          {t('loggedOn', { day: dayText.dayLabel(reading.lastDate) })}
        </Txt>
      </View>

      <View style={styles.deltaBlock}>
        <Txt variant="label" color="muted" align="end" numberOfLines={1}>
          {t('change')}
        </Txt>
        {logs.length === 1 ? (
          <>
            <Txt color="muted" align="end" numberOfLines={1} style={styles.deltaValue}>
              {t('firstEntry')}
            </Txt>
            <Txt variant="caption" color="faint" align="end" numberOfLines={2}>
              {t('nothingToCompare')}
            </Txt>
          </>
        ) : (
          <>
            <Txt
              weight="semibold"
              tabular
              align="end"
              numberOfLines={1}
              style={styles.deltaValue}
            >
              {reading.steady
                ? t('noChange')
                : `${formatAmount(Math.abs(reading.delta))} ${unitLabel}`}
            </Txt>
            <Txt variant="caption" color="faint" align="end" numberOfLines={2}>
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

        <View style={styles.readings}>
          {logs.map((log, index) => {
            const last = index === logs.length - 1;
            return (
              <View key={log.id} style={styles.readingRow}>
                <Txt
                  variant="label"
                  color={last ? 'text' : 'muted'}
                  numberOfLines={1}
                  style={styles.readingDay}
                >
                  {dayText.dayLabel(log.date)}
                </Txt>
                <Txt
                  variant="label"
                  weight={last ? 'semibold' : 'regular'}
                  tabular
                  align="end"
                  numberOfLines={1}
                >
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
            {/* Horizontal rules only: a time axis needs no vertical grid. */}
            <Line
              x1={GUTTER}
              x2={width - RIGHT_INSET}
              y1={model.yHigh}
              y2={model.yHigh}
              stroke={colors.border}
              strokeWidth={1}
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
                />
                <SvgText x={0} y={model.yLow + 13} fill={colors.textFaint} fontSize={fontSize.xs}>
                  {formatAmount(model.lowest)}
                </SvgText>
              </>
            )}

            <Polyline
              points={model.polyline}
              fill="none"
              stroke={colors.text}
              strokeWidth={LINE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {model.points.map((point, index) => {
              const last = index === model.points.length - 1;
              if (!showDots && !last) return null;
              return (
                <Circle
                  key={point.key}
                  cx={point.x}
                  cy={point.y}
                  r={last ? 3.5 : 2}
                  fill={last ? colors.text : colors.bg}
                  stroke={colors.text}
                  strokeWidth={last ? 0 : LINE_WIDTH}
                />
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
  },
  currentValue: {
    marginBottom: 2,
    marginTop: spacing.xs,
  },
  deltaBlock: {
    alignItems: 'flex-end',
    flexShrink: 1,
  },
  deltaValue: {
    marginBottom: 2,
    marginTop: spacing.sm,
  },
  plot: {
    marginTop: spacing.xl,
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
    marginTop: spacing.xl,
    rowGap: spacing.sm,
  },
  readingRow: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  readingDay: {
    flexGrow: 1,
    flexShrink: 1,
  },
  sparseHint: {
    marginTop: spacing.lg,
    maxWidth: layout.maxTextWidth,
  },
  sparseAction: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
  },
});
