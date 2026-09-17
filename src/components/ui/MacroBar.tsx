import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { Txt } from './Txt';

export interface MacroBarProps {
  label: string;
  value: number;
  target: number;
  color: string;
  /** Defaults to grams. */
  unit?: string;
  style?: StyleProp<ViewStyle>;
}

function round(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * Groups thousands without depending on the device locale. Kept local so the design
 * system never has to reach into a route module for a formatter.
 */
function formatCount(value: number): string {
  return round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A tiny amount still has to be visible, so the fill never drops below a sliver. */
const MIN_FILL = 4;
/** The overflow tail is capped so a large overshoot cannot swallow the bar. */
const MAX_OVER = 30;

export function MacroBar({ label, value, target, color, unit = 'g', style }: MacroBarProps) {
  const { colors } = useTheme();

  const shown = round(value);
  const goal = round(target);
  const over = goal > 0 && shown > goal;

  const ratio = goal > 0 ? Math.min(shown / goal, 1) : shown > 0 ? 1 : 0;
  const overPct = over ? Math.min((shown - goal) / goal, 1) * MAX_OVER : 0;
  // Under target: a sliver at minimum. Over: the macro colour gives up the tail.
  const fillPct = over
    ? 100 - overPct
    : shown > 0
      ? Math.max(ratio * 100, MIN_FILL)
      : 0;

  return (
    <View
      style={style}
      accessibilityRole="progressbar"
      accessibilityLabel={
        over
          ? `${label}: ${formatCount(shown)} of ${formatCount(goal)} ${unit}, over target`
          : `${label}: ${formatCount(shown)} of ${formatCount(goal)} ${unit}`
      }
      accessibilityValue={{ min: 0, max: goal, now: shown }}
    >
      <View style={styles.header}>
        <Txt variant="caption" weight="bold" color="faint" numberOfLines={1} style={styles.label}>
          {label.toUpperCase()}
        </Txt>
        <View style={styles.values}>
          <Txt variant="label" weight="bold" color={over ? colors.warning : colors.text} tabular>
            {formatCount(shown)}
          </Txt>
          <Txt variant="label" color="faint" tabular style={styles.goal}>
            {`/ ${formatCount(goal)}`}
          </Txt>
          <Txt variant="caption" color="faint" weight="medium" style={styles.unit}>
            {unit}
          </Txt>
        </View>
      </View>

      <View style={[styles.track, { backgroundColor: colors.track }]}>
        {fillPct > 0 ? (
          <View style={[styles.fill, { backgroundColor: color, width: `${fillPct}%` }]} />
        ) : null}
        {over ? (
          <View style={[styles.over, { backgroundColor: colors.warning, width: `${overPct}%` }]} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs + 2,
  },
  label: {
    flexShrink: 1,
    marginEnd: spacing.sm,
  },
  values: {
    alignItems: 'baseline',
    flexDirection: 'row',
  },
  goal: {
    marginStart: spacing.xs,
  },
  unit: {
    marginStart: spacing.xs / 2,
  },
  track: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 8,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    borderRadius: radius.pill,
    height: '100%',
    minWidth: 6,
  },
  over: {
    height: '100%',
  },
});
