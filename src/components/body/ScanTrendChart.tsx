import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { daysBetween } from '@/domain/date';
import { formatAmount, formatCount } from '@/domain/format';
import { useDirection } from '@/i18n';
import { fontSize, spacing, useTheme } from '@/theme';
import type { BodyScan } from '@/types';

import { useScanDate } from './useScanDate';

/** The four readings worth a line. Everything else lives in the reading list. */
const TRENDABLE = ['weightKg', 'skeletalMuscleKg', 'bodyFatKg', 'bodyFatPercent'] as const;

export type TrendMetric = (typeof TRENDABLE)[number];

interface TrendDef {
  /** Spoken in the chart summary. */
  labelKey: 'body:fieldWeight' | 'body:fieldMuscle' | 'body:fieldFatMass' | 'body:fieldFatPercent';
  /** Fits a quarter of the selector. */
  shortKey:
    | 'body:trendShortWeight'
    | 'body:trendShortMuscle'
    | 'body:trendShortFatMass'
    | 'body:trendShortFatPercent';
  unitKey: 'units:kg' | 'units:percent';
  decimals: number;
}

const TREND_DEFS: Record<TrendMetric, TrendDef> = {
  weightKg: {
    labelKey: 'body:fieldWeight',
    shortKey: 'body:trendShortWeight',
    unitKey: 'units:kg',
    decimals: 1,
  },
  skeletalMuscleKg: {
    labelKey: 'body:fieldMuscle',
    shortKey: 'body:trendShortMuscle',
    unitKey: 'units:kg',
    decimals: 1,
  },
  bodyFatKg: {
    labelKey: 'body:fieldFatMass',
    shortKey: 'body:trendShortFatMass',
    unitKey: 'units:kg',
    decimals: 1,
  },
  bodyFatPercent: {
    labelKey: 'body:fieldFatPercent',
    shortKey: 'body:trendShortFatPercent',
    unitKey: 'units:percent',
    decimals: 1,
  },
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

/**
 * One measured metric across every scan that carries it. Readings are spaced by
 * the days between them, so a long gap looks like a long gap. The plot itself
 * runs oldest to newest left to right in both languages, the way a time axis is
 * read in Arabic technical material too; only the labels change language.
 */
export function ScanTrendChart({ scans, style }: ScanTrendChartProps) {
  const { t } = useTranslation(['body', 'units']);
  const { colors } = useTheme();
  const { isRTL } = useDirection();
  const { shortDay } = useScanDate();
  const [metric, setMetric] = useState<TrendMetric>('weightKg');
  const [width, setWidth] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => (current === next ? current : next));
  }, []);

  const def = TREND_DEFS[metric];
  const label = t(def.labelKey);
  const unit = t(def.unitKey);

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

  const options = TRENDABLE.map((value) => ({ value, label: t(TREND_DEFS[value].shortKey) }));
  const latest = series[series.length - 1];

  const summary =
    series.length > 1
      ? t('trendSummary', {
          label,
          first: `${formatAmount(series[0]?.value ?? 0, def.decimals)} ${unit}`,
          firstDay: shortDay(model.firstDate),
          last: `${formatAmount(latest?.value ?? 0, def.decimals)} ${unit}`,
          lastDay: shortDay(model.lastDate),
          n: formatCount(series.length),
        })
      : '';

  // The plot does not mirror, so its two end labels keep their physical order:
  // in Arabic the row itself flips, and the children are swapped back.
  const axisDays = [shortDay(model.firstDate), shortDay(model.lastDate)];
  const axis = isRTL ? [...axisDays].reverse() : axisDays;

  return (
    <View style={style}>
      <SegmentedControl options={options} value={metric} onChange={setMetric} />

      {series.length === 0 ? (
        <Txt color="muted" style={styles.note}>
          {t('trendEmpty', { label })}
        </Txt>
      ) : series.length === 1 ? (
        <View style={styles.single}>
          <Txt variant="caption" color="faint" weight="semibold">
            {label.toUpperCase()}
          </Txt>
          <View style={styles.singleRow}>
            <Txt variant="title" tabular>
              {formatAmount(latest?.value ?? 0, def.decimals)}
            </Txt>
            <Txt variant="label" color="faint" weight="medium" style={styles.unit}>
              {unit}
            </Txt>
          </View>
          <Txt variant="caption" color="faint">
            {t('trendSingle', { day: shortDay(model.lastDate) })}
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
                  {formatAmount(model.highest, def.decimals)}
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
                      {formatAmount(model.lowest, def.decimals)}
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
            {axis.map((day, index) => (
              <Txt key={`${day}-${index}`} variant="caption" color="faint" numberOfLines={1}>
                {day}
              </Txt>
            ))}
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
    marginStart: spacing.xs + 1,
  },
  plot: {
    marginTop: spacing.md,
    width: '100%',
  },
  // Physical padding on purpose: it lines the labels up with a plot that does
  // not mirror.
  axis: {
    columnGap: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: GUTTER,
    paddingRight: RIGHT_INSET,
  },
});
