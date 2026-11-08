import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Txt, type TxtColor } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

import { TrendSpark } from './TrendSpark';

/**
 * How a change reads. Every tone stays below the figure it belongs to: 'good'
 * is quiet ink, 'poor' a muted warning, 'neutral' fades back, because a
 * direction that depends on the goal is not a verdict.
 */
export type MetricTone = 'neutral' | 'good' | 'poor';

export interface MetricRow {
  /** Stable key, usually the field the figure came from. */
  key: string;
  /** Already translated. */
  label: string;
  /** Already formatted. An em dash stands in for a figure there is none of. */
  value: string;
  /** Printed after the value in the same text run, e.g. "kg". */
  unit?: string;
  /** One quiet line under the label, e.g. the target the figure is read against. */
  hint?: string;
  /** Already formatted and signed, e.g. "+3.4". */
  delta?: string;
  tone?: MetricTone;
  /** Every reading behind this figure, oldest first. Two or more draw a line. */
  series?: number[];
  /** Full sentence for assistive tech; composed from the parts when absent. */
  spoken?: string;
}

export interface MetricTableProps {
  rows: MetricRow[];
  style?: StyleProp<ViewStyle>;
}

const SPARK_WIDTH = 52;
const SPARK_HEIGHT = 18;

/** Below two points there is no shape to draw. */
function hasShape(series: number[] | undefined): series is number[] {
  return series !== undefined && series.length > 1;
}

/**
 * A table of figures: label on one side, the number on the other, a hairline
 * between rows and nothing around it.
 *
 * The sparkline is texture rather than a chart — it only says which way the
 * readings went, and it keeps its column even on rows that have no series so
 * the figures stay in one line down the page.
 */
export function MetricTable({ rows, style }: MetricTableProps) {
  const { colors } = useTheme();

  const sparkColumn = rows.some((row) => hasShape(row.series));

  // A delta never reaches full ink: the figure above it is the thing being read.
  const toneColor = (tone: MetricTone | undefined): TxtColor =>
    tone === 'good' ? colors.textMuted : tone === 'poor' ? colors.warning : colors.textFaint;

  return (
    <View style={style}>
      {rows.map((row, index) => (
        <View
          key={row.key}
          accessible
          accessibilityLabel={
            row.spoken ??
            [row.label, `${row.value}${row.unit ? ` ${row.unit}` : ''}`, row.hint]
              .filter(Boolean)
              .join('. ')
          }
          style={[
            styles.row,
            index > 0 ? [styles.ruled, { borderColor: colors.border }] : null,
          ]}
        >
          <View style={styles.labelCol}>
            <Txt variant="label" color="muted" numberOfLines={2}>
              {row.label}
            </Txt>
            {row.hint ? (
              <Txt variant="caption" color="faint" tabular numberOfLines={1} style={styles.hint}>
                {row.hint}
              </Txt>
            ) : null}
          </View>

          {sparkColumn ? (
            hasShape(row.series) ? (
              <TrendSpark
                values={row.series}
                color={colors.textFaint}
                height={SPARK_HEIGHT}
                style={styles.spark}
              />
            ) : (
              <View style={styles.spark} />
            )
          ) : null}

          <View style={styles.figureCol}>
            {/* One run: as separate elements the figure and its unit collide in
                Arabic and read as a single longer number. */}
            <Txt variant="metric" tabular align="end" numberOfLines={1} style={styles.value}>
              {row.value}
              {row.unit ? (
                <Txt variant="label" color="faint" weight="medium">
                  {` ${row.unit}`}
                </Txt>
              ) : null}
            </Txt>
            {row.delta ? (
              <Txt
                variant="label"
                color={toneColor(row.tone)}
                tabular
                align="end"
                numberOfLines={1}
                style={styles.delta}
              >
                {row.delta}
              </Txt>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    columnGap: spacing.lg,
    flexDirection: 'row',
    minHeight: 56,
    paddingVertical: spacing.md,
  },
  ruled: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  labelCol: {
    flexGrow: 1,
    flexShrink: 1,
  },
  hint: {
    marginTop: 2,
  },
  spark: {
    flexShrink: 0,
    height: SPARK_HEIGHT,
    width: SPARK_WIDTH,
  },
  figureCol: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  value: {
    // A figure never shrinks or wraps to fit its column.
    flexShrink: 0,
  },
  delta: {
    marginTop: 2,
  },
});
