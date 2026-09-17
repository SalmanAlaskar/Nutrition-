import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { SegmentedControl, Txt } from '@/components/ui';
import { daysBetween, formatShortDay } from '@/domain/date';
import { fontSize, spacing, useTheme } from '@/theme';
import type { BodyScan } from '@/types';

/** The four readings worth a line. Everything else lives in the reading list. */
const TRENDABLE = ['weightKg', 'skeletalMuscleKg', 'bodyFatKg', 'bodyFatPercent'] as const;

export type TrendMetric = (typeof TRENDABLE)[number];

interface TrendDef {
  /** Spoken in the chart summary. */
  label: string;
  /** Fits a quarter of the selector. */
  short: string;
  unit: string;
  decimals: number;
}

const TREND_DEFS: Record<TrendMetric, TrendDef> = {
  weightKg: { label: 'Weight', short: 'Weight', unit: 'kg', decimals: 1 },
  skeletalMuscleKg: { label: 'Skeletal muscle', short: 'Muscle', unit: 'kg', decimals: 1 },
  bodyFatKg: { label: 'Body fat mass', short: 'Fat kg', unit: 'kg', decimals: 1 },
  bodyFatPercent: { label: 'Percent body fat', short: 'Fat %', unit: '%', decimals: 1 },
};

export interface ScanTrendChartProps {
  /** Readings oldest first. */
  scans: BodyScan[];
  style?: StyleProp<ViewStyle>;
}

const HEIGHT = 150;
const TOP = 16;
const BOTTOM = HEIGHT - 16;
const GUTTER = 44;
const RIGHT_INSET = 10;

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

function format(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

/**
 * One measured metric across every scan that carries it. Readings are spaced by
 * the days between them, so a long gap looks like a long gap.
 */
export function ScanTrendChart({ scans, style }: ScanTrendChartProps) {
  const { colors } = useTheme();
  const [metric, setMetric] = useState<TrendMetric>('weightKg');
  const [width, setWidth] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => (current === next ? current : next));
  }, []);

  const def = TREND_DEFS[metric];

  const series = useMemo(
    () =>
      scans
        .map((scan) => ({ id: scan.id, date: scan.date, value: scan[metric] }))
        .filter((point): point is { id: string; date: string; value: number } =>
          typeof point.value === 'number' && Number.isFinite(point.value),
        ),
    [scans, metric],
  );

  const model = useMemo(() => {
    const values = series.map((point) => point.value);
    const lowest = values.length > 0 ? Math.min(...values) : 0;
    const highest = values.length > 0 ? Math.max(...values) : 0;
    const span = highest - lowest;
    const pad = span < 0.2 ? 0.5 : span * 0.15;
    const lo = lowest - pad;
    const hi = highest + pad;

    const first = series[0]?.date ?? '';
    const last = series[series.length - 1]?.date ?? '';
    const daySpan = Math.max(1, first && last ? daysBetween(first, last) : 1);
    const plotWidth = Math.max(0, width - GUTTER - RIGHT_INSET);
    const plotHeight = BOTTOM - TOP;

    const y = (value: number) => BOTTOM - ((value - lo) / (hi - lo)) * plotHeight;
    const points = series.map((point) => ({
      key: point.id,
      x: GUTTER + Math.min(1, Math.max(0, daysBetween(first, point.date) / daySpan)) * plotWidth,
      y: y(point.value),
    }));

    return {
      lowest,
      highest,
      flat: highest - lowest < 0.05,
      yHigh: y(highest),
      yLow: y(lowest),
      points,
      polyline: points.map((point) => `${point.x},${point.y}`).join(' '),
      firstDate: first,
      lastDate: last,
    };
  }, [series, width]);

  const options = TRENDABLE.map((value) => ({ value, label: TREND_DEFS[value].short }));
  const latest = series[series.length - 1];
  const unitSuffix = def.unit ? ` ${def.unit}` : '';

  const summary =
    series.length > 1
      ? `${def.label} from ${format(series[0]?.value ?? 0, def.decimals)}${unitSuffix} on ` +
        `${formatShortDay(model.firstDate)} to ${format(latest?.value ?? 0, def.decimals)}${unitSuffix} on ` +
        `${formatShortDay(model.lastDate)}, across ${series.length} readings.`
      : '';

  return (
    <View style={style}>
      <SegmentedControl options={options} value={metric} onChange={setMetric} />

      {series.length === 0 ? (
        <Txt color="muted" style={styles.note}>
          {`No reading has ${def.label.toLowerCase()} yet. Add it to a scan and the line appears here.`}
        </Txt>
      ) : series.length === 1 ? (
        <View style={styles.single}>
          <Txt variant="caption" color="faint" weight="semibold">
            {def.label.toUpperCase()}
          </Txt>
          <View style={styles.singleRow}>
            <Txt variant="title" tabular>
              {format(latest?.value ?? 0, def.decimals)}
            </Txt>
            {def.unit ? (
              <Txt variant="label" color="faint" weight="medium" style={styles.unit}>
                {def.unit}
              </Txt>
            ) : null}
          </View>
          <Txt variant="caption" color="faint">
            {`One reading, on ${formatShortDay(model.lastDate)}. A second one draws the line.`}
          </Txt>
        </View>
      ) : (
        <>
          <View
            onLayout={handleLayout}
            style={[styles.plot, { height: HEIGHT }]}
            accessible
            accessibilityRole="image"
            accessibilityLabel={summary}
          >
            {width > 0 ? (
              <Svg width={width} height={HEIGHT}>
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
                  {format(model.highest, def.decimals)}
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
                      {format(model.lowest, def.decimals)}
                    </SvgText>
                  </>
                )}

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
                  return (
                    <Circle
                      key={point.key}
                      cx={point.x}
                      cy={point.y}
                      r={last ? 4.5 : 3}
                      fill={last ? colors.accent : colors.bg}
                      stroke={colors.accent}
                      strokeWidth={last ? 0 : 2}
                    />
                  );
                })}
              </Svg>
            ) : null}
          </View>

          <View style={styles.axis} {...DECORATIVE}>
            <Txt variant="caption" color="faint">
              {formatShortDay(model.firstDate)}
            </Txt>
            <Txt variant="caption" color="faint">
              {formatShortDay(model.lastDate)}
            </Txt>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    marginTop: spacing.lg,
  },
  single: {
    marginTop: spacing.lg,
    rowGap: 2,
  },
  singleRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
  },
  unit: {
    marginLeft: spacing.xs + 1,
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
});
