import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Txt } from '@/components/ui';
import { segmentalBalance } from '@/domain/bodyScan';
import { radius, spacing, useTheme } from '@/theme';
import type { BodyScan, SegmentalValues } from '@/types';

export interface SegmentalChartProps {
  scan: BodyScan;
  style?: StyleProp<ViewStyle>;
}

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

const SEGMENT_ORDER: { key: keyof SegmentalValues; label: string }[] = [
  { key: 'rightArm', label: 'Right arm' },
  { key: 'leftArm', label: 'Left arm' },
  { key: 'trunk', label: 'Trunk' },
  { key: 'rightLeg', label: 'Right leg' },
  { key: 'leftLeg', label: 'Left leg' },
];

/** A pair is drawn together so the two sides can be compared at a glance. */
const PAIRED: (keyof SegmentalValues)[] = ['leftArm', 'leftLeg'];

const BAR_HEIGHT = 10;
const MIN_BAR_FRACTION = 0.04;

function kg(value: number): string {
  return `${(Math.round(value * 100) / 100).toFixed(2)} kg`;
}

function rows(values: SegmentalValues): { key: keyof SegmentalValues; label: string; value: number }[] {
  const present: { key: keyof SegmentalValues; label: string; value: number }[] = [];
  for (const segment of SEGMENT_ORDER) {
    const value = values[segment.key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      present.push({ key: segment.key, label: segment.label, value });
    }
  }
  return present;
}

function describeDiff(diff: number, what: string): string {
  if (Math.abs(diff) < 0.05) return `Your ${what} read the same on both sides.`;
  const side = diff > 0 ? 'right' : 'left';
  return `Your ${side} ${what.slice(0, -1)} reads ${kg(Math.abs(diff))} heavier than the other.`;
}

/**
 * Segmental lean mass, and fat mass when the sheet carried it, as horizontal bars.
 * Left and right sit next to each other because the gap between them is the point.
 */
export function SegmentalChart({ scan, style }: SegmentalChartProps) {
  const { colors } = useTheme();

  const lean = scan.segmentalLeanKg ? rows(scan.segmentalLeanKg) : [];
  const fat = scan.segmentalFatKg ? rows(scan.segmentalFatKg) : [];
  if (lean.length === 0 && fat.length === 0) return null;

  const balance = segmentalBalance(scan);

  const group = (
    title: string,
    entries: { key: keyof SegmentalValues; label: string; value: number }[],
    color: string,
  ) => {
    const max = Math.max(...entries.map((entry) => entry.value));
    return (
      <View style={styles.group}>
        <Txt variant="caption" color="faint" weight="bold" style={styles.groupTitle}>
          {title.toUpperCase()}
        </Txt>
        {entries.map((entry) => {
          const fraction = max > 0 ? Math.max(MIN_BAR_FRACTION, entry.value / max) : MIN_BAR_FRACTION;
          return (
            <View
              key={entry.key}
              accessible
              accessibilityLabel={`${entry.label}, ${kg(entry.value)}`}
              style={[styles.row, PAIRED.includes(entry.key) ? styles.rowPaired : null]}
            >
              <Txt variant="label" color="muted" numberOfLines={1} style={styles.rowLabel}>
                {entry.label}
              </Txt>
              <View style={[styles.track, { backgroundColor: colors.track }]} {...DECORATIVE}>
                <View
                  style={[
                    styles.bar,
                    { backgroundColor: color, width: `${Math.round(fraction * 100)}%` },
                  ]}
                />
              </View>
              <Txt variant="label" weight="semibold" tabular style={styles.rowValue}>
                {entry.value.toFixed(2)}
              </Txt>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={style}>
      {lean.length > 0 ? group('Lean mass, kg', lean, colors.accent) : null}
      {fat.length > 0 ? group('Fat mass, kg', fat, colors.fat) : null}

      {balance ? (
        <Txt variant="label" color="muted" style={styles.balance}>
          {`${describeDiff(balance.armDiff, 'arms')} ${describeDiff(balance.legDiff, 'legs')}`}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginTop: spacing.md,
  },
  groupTitle: {
    marginBottom: spacing.sm,
  },
  row: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    minHeight: 28,
  },
  rowPaired: {
    marginBottom: spacing.sm,
  },
  rowLabel: {
    width: 74,
  },
  track: {
    borderRadius: radius.pill,
    flex: 1,
    height: BAR_HEIGHT,
    overflow: 'hidden',
  },
  bar: {
    borderRadius: radius.pill,
    height: BAR_HEIGHT,
  },
  rowValue: {
    minWidth: 46,
    textAlign: 'right',
  },
  balance: {
    marginTop: spacing.lg,
  },
});
