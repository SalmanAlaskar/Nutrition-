import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { Txt } from '@/components/ui';
import { weekdayInitial } from '@/domain/date';
import { fontSize, spacing, useTheme } from '@/theme';

import { formatCount } from '../../../app/onboarding/_layout';

export interface CalorieChartDay {
  /** Local calendar day, 'YYYY-MM-DD'. */
  date: string;
  calories: number;
  /** False when nothing was logged: the day is drawn as a faint placeholder. */
  logged: boolean;
}

export interface CalorieChartProps {
  /** Oldest first, one entry per day in the range. */
  days: CalorieChartDay[];
  /** Dashed reference line. Pass 0 to hide it. */
  target: number;
  style?: StyleProp<ViewStyle>;
}

const PLOT_HEIGHT = 156;
const BOTTOM_INSET = 10;
/** Headroom above the tallest bar; larger when values are printed on top. */
const TOP_INSET = 12;
const TOP_INSET_WITH_VALUES = 24;
/** Height of the hairline that stands in for a day with no meals. */
const STUB_HEIGHT = 3;
/** Below this slot width the weekday initials start to collide. */
const MIN_LABEL_SLOT = 22;
/** Below this slot width a four-digit value cannot sit over a bar. */
const MIN_VALUE_SLOT = 42;

/** Decoration is hidden from assistive tech; the prop differs per platform. */
const DECORATIVE = Platform.select({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants' as const,
  },
});

/**
 * Daily calories as bars on a shared baseline. Days with no meals are drawn as
 * a hairline stub rather than a full-height track, so a sparse month reads as
 * mostly empty instead of mostly maxed out.
 */
export function CalorieChart({ days, target, style }: CalorieChartProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => (current === next ? current : next));
  }, []);

  const count = days.length;
  const loggedCount = useMemo(() => days.filter((day) => day.logged).length, [days]);

  const geometry = useMemo(() => {
    const slot = count > 0 ? width / count : 0;
    const barWidth = Math.max(3, Math.min(slot * 0.62, 22));
    const showValues = count <= 10 && slot >= MIN_VALUE_SLOT;
    const topInset = showValues ? TOP_INSET_WITH_VALUES : TOP_INSET;
    const plotHeight = PLOT_HEIGHT - topInset - BOTTOM_INSET;
    const baselineY = topInset + plotHeight;

    const peak = days.reduce((max, day) => Math.max(max, day.calories), target);
    const scaleMax = peak > 0 ? peak * 1.15 : 1;
    const labelStep = slot > 0 ? Math.max(1, Math.ceil(MIN_LABEL_SLOT / slot)) : 1;

    const bars = days.map((day, index) => {
      const center = index * slot + slot / 2;
      const filled =
        day.logged && day.calories > 0
          ? Math.max(5, (day.calories / scaleMax) * plotHeight)
          : 0;
      return {
        key: day.date,
        x: center - barWidth / 2,
        center,
        height: filled,
        y: baselineY - filled,
        value: Math.round(day.calories),
        over: target > 0 && day.calories > target,
      };
    });

    return {
      bars,
      barWidth,
      labelStep,
      showValues,
      baselineY,
      targetY: target > 0 ? baselineY - (target / scaleMax) * plotHeight : null,
    };
  }, [days, target, count, width]);

  const summary = useMemo(() => {
    if (loggedCount === 0) {
      return `Daily calories over the last ${count} days. Nothing logged in this range.`;
    }
    const total = days.reduce((sum, day) => sum + (day.logged ? day.calories : 0), 0);
    const mean = Math.round(total / loggedCount);
    const goal = target > 0 ? `, against a target of ${formatCount(target)}` : '';
    return `Daily calories over the last ${count} days. ${loggedCount} ${
      loggedCount === 1 ? 'day' : 'days'
    } logged, averaging ${formatCount(mean)} kilocalories${goal}.`;
  }, [days, count, loggedCount, target]);

  return (
    <View style={style}>
      <View
        onLayout={handleLayout}
        style={[styles.plot, { height: PLOT_HEIGHT }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={summary}
      >
        {width > 0 && count > 0 ? (
          <Svg width={width} height={PLOT_HEIGHT}>
            {/* Behind everything: the day floor and the target reference. */}
            <Line
              x1={0}
              x2={width}
              y1={geometry.baselineY + 0.5}
              y2={geometry.baselineY + 0.5}
              stroke={colors.border}
              strokeWidth={1}
            />

            {geometry.targetY !== null ? (
              <Line
                x1={0}
                x2={width}
                y1={geometry.targetY}
                y2={geometry.targetY}
                stroke={colors.textFaint}
                strokeWidth={1}
                strokeOpacity={0.55}
                strokeDasharray="4 6"
              />
            ) : null}

            {/* A day with no meals: a stub on the floor, not an empty track. */}
            {geometry.bars.map((bar) =>
              bar.height === 0 ? (
                <Rect
                  key={`stub-${bar.key}`}
                  x={bar.x}
                  y={geometry.baselineY - STUB_HEIGHT}
                  width={geometry.barWidth}
                  height={STUB_HEIGHT}
                  rx={STUB_HEIGHT / 2}
                  fill={colors.border}
                />
              ) : null,
            )}

            {geometry.bars.map((bar) =>
              bar.height > 0 ? (
                <Rect
                  key={`bar-${bar.key}`}
                  x={bar.x}
                  y={bar.y}
                  width={geometry.barWidth}
                  height={bar.height}
                  rx={Math.min(geometry.barWidth / 2, bar.height / 2)}
                  fill={bar.over ? colors.warning : colors.accent}
                />
              ) : null,
            )}

            {geometry.showValues
              ? geometry.bars.map((bar) =>
                  bar.height > 0 ? (
                    <SvgText
                      key={`value-${bar.key}`}
                      x={bar.center}
                      y={bar.y - 7}
                      fill={bar.over ? colors.warning : colors.textMuted}
                      fontSize={fontSize.xs}
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {formatCount(bar.value)}
                    </SvgText>
                  ) : null,
                )
              : null}
          </Svg>
        ) : null}

        {loggedCount === 0 && count > 0 ? (
          <View style={styles.blank} pointerEvents="none" {...DECORATIVE}>
            <Txt variant="label" color="faint" align="center">
              No meals logged in this range
            </Txt>
          </View>
        ) : null}
      </View>

      <View style={styles.labels} pointerEvents="none" {...DECORATIVE}>
        {days.map((day, index) => {
          const show = (count - 1 - index) % geometry.labelStep === 0;
          const last = index === count - 1;
          return (
            <View key={day.date} style={styles.labelCell}>
              {show ? (
                <Txt
                  variant="caption"
                  color={last ? 'muted' : 'faint'}
                  weight={last ? 'bold' : 'medium'}
                  align="center"
                  numberOfLines={1}
                >
                  {weekdayInitial(day.date)}
                </Txt>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        {target > 0 ? (
          <View style={styles.legendItem}>
            <View style={styles.swatch} {...DECORATIVE}>
              <Svg width={16} height={2}>
                <Line
                  x1={0}
                  x2={16}
                  y1={1}
                  y2={1}
                  stroke={colors.textFaint}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              </Svg>
            </View>
            <Txt variant="caption" color="faint" tabular>
              {`Target ${formatCount(target)} kcal`}
            </Txt>
          </View>
        ) : null}

        {loggedCount < count ? (
          <View style={styles.legendItem}>
            <View
              style={[styles.stubSwatch, { backgroundColor: colors.border }]}
              {...DECORATIVE}
            />
            <Txt variant="caption" color="faint">
              Not logged
            </Txt>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: {
    justifyContent: 'flex-end',
    width: '100%',
  },
  blank: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  labels: {
    flexDirection: 'row',
    marginTop: spacing.sm - 2,
    width: '100%',
  },
  labelCell: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    overflow: 'hidden',
  },
  legend: {
    alignItems: 'center',
    columnGap: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    rowGap: spacing.xs,
  },
  legendItem: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  swatch: {
    height: 2,
    justifyContent: 'center',
    width: 16,
  },
  stubSwatch: {
    borderRadius: 1.5,
    height: 3,
    width: 16,
  },
});
