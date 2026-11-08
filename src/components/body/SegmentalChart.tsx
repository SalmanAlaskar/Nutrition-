import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Txt } from '@/components/ui';
import { formatAmount, formatDelta } from '@/domain/format';
import { radius, spacing, useTheme } from '@/theme';
import type { BodyScan, SegmentalValues } from '@/types';

export interface SegmentalChartProps {
  scan: BodyScan;
  /**
   * The reading before this one. When it carries the same parts, every bar
   * gains a signed change, which is the whole point of the chart: a limb that
   * was standing still and then started moving.
   */
  previous?: BodyScan;
  style?: StyleProp<ViewStyle>;
}

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

/** A thin mark reads as a measurement; a thick one reads as a button. */
const BAR_HEIGHT = 6;
/** The lighter side of a pair, so the heavier one reads as the heavier one. */
const LIGHT_SIDE_OPACITY = 0.38;
/** Below this many kilograms the two sides are the same reading, not a gap. */
const EVEN_KG = 0.1;
/** Keeps a very small bar visible at all. */
const MIN_BAR_FRACTION = 0.05;
/** Stands in for a part the earlier reading did not carry. */
const MISSING = '—';

/** Right and left of one limb pair, drawn together because the gap is the point. */
interface Pair {
  id: 'arms' | 'legs';
  titleKey: 'pairArms' | 'pairLegs';
  rightKey: 'rightArm' | 'rightLeg';
  leftKey: 'leftArm' | 'leftLeg';
}

const PAIRS: Pair[] = [
  { id: 'arms', titleKey: 'pairArms', rightKey: 'rightArm', leftKey: 'leftArm' },
  { id: 'legs', titleKey: 'pairLegs', rightKey: 'rightLeg', leftKey: 'leftLeg' },
];

const PART_KEYS = {
  rightArm: 'segmentRightArm',
  leftArm: 'segmentLeftArm',
  rightLeg: 'segmentRightLeg',
  leftLeg: 'segmentLeftLeg',
  trunk: 'segmentTrunk',
} as const satisfies Record<keyof SegmentalValues, string>;

function value(values: SegmentalValues | undefined, key: keyof SegmentalValues): number | undefined {
  const raw = values?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

/**
 * Segmental muscle, and fat when the sheet carried it. Each limb pair is drawn
 * as two bars on one scale, so a side that reads lighter is visible without
 * reading a single number, and each bar carries what it did since last time.
 */
export function SegmentalChart({ scan, previous, style }: SegmentalChartProps) {
  const { t } = useTranslation(['body', 'units']);
  const { colors } = useTheme();

  const kg = t('units:kg');

  const group = (
    titleKey: 'leanMass' | 'fatMass',
    values: SegmentalValues | undefined,
    earlier: SegmentalValues | undefined,
    color: string,
  ) => {
    if (!values) return null;

    const present = PAIRS.filter(
      (pair) =>
        value(values, pair.rightKey) !== undefined || value(values, pair.leftKey) !== undefined,
    );
    const trunk = value(values, 'trunk');
    if (present.length === 0 && trunk === undefined) return null;

    // One scale per group, so the bars inside it compare with each other and a
    // light arm never looks like a heavy leg.
    const scale = Math.max(
      ...PAIRS.flatMap((pair) => [
        value(values, pair.rightKey) ?? 0,
        value(values, pair.leftKey) ?? 0,
      ]),
      trunk ?? 0,
    );

    const bar = (key: keyof SegmentalValues, label: string, amount: number, heavier: boolean) => {
      const fraction = scale > 0 ? Math.max(MIN_BAR_FRACTION, amount / scale) : MIN_BAR_FRACTION;
      const part = t(PART_KEYS[key]);
      const reading = `${formatAmount(amount, 2)} ${kg}`;
      const before = value(earlier, key);
      const moved = before === undefined ? undefined : amount - before;

      return (
        <View
          key={`${titleKey}-${key}`}
          accessible
          accessibilityLabel={
            moved === undefined
              ? t('segmentSpoken', { part, value: reading })
              : t('segmentMoved', {
                  part,
                  value: reading,
                  change: `${formatDelta(moved, 2)} ${kg}`,
                })
          }
          style={styles.row}
        >
          <Txt variant="label" color="muted" numberOfLines={1} style={styles.rowLabel}>
            {label}
          </Txt>

          <View style={[styles.track, { backgroundColor: colors.track }]} {...DECORATIVE}>
            <View
              style={[
                styles.bar,
                {
                  backgroundColor: color,
                  opacity: heavier ? 1 : LIGHT_SIDE_OPACITY,
                  width: `${Math.round(fraction * 100)}%`,
                },
              ]}
            />
          </View>

          <Txt variant="label" tabular align="end" numberOfLines={1} style={styles.rowValue}>
            {formatAmount(amount, 2)}
          </Txt>

          {earlier ? (
            <Txt
              variant="label"
              color="faint"
              tabular
              align="end"
              numberOfLines={1}
              style={styles.rowDelta}
            >
              {moved === undefined ? MISSING : formatDelta(moved, 2)}
            </Txt>
          ) : null}
        </View>
      );
    };

    return (
      <View style={styles.group}>
        <View style={styles.groupHead}>
          <Txt variant="label" weight="semibold" numberOfLines={1} style={styles.groupTitle}>
            {t(titleKey)}
          </Txt>
          <Txt variant="caption" color="faint" numberOfLines={1}>
            {kg}
          </Txt>
        </View>

        {present.map((pair) => {
          const right = value(values, pair.rightKey);
          const left = value(values, pair.leftKey);
          const diff = right !== undefined && left !== undefined ? right - left : null;
          const gap =
            diff === null
              ? null
              : Math.abs(diff) < EVEN_KG
                ? t('gapEven')
                : t(diff > 0 ? 'gapRight' : 'gapLeft', {
                    amount: `${formatAmount(Math.abs(diff), 2)} ${kg}`,
                  });

          return (
            <View key={pair.id} style={styles.pair}>
              <View style={styles.pairHead}>
                <Txt variant="caption" color="muted" numberOfLines={1} style={styles.pairTitle}>
                  {t(pair.titleKey)}
                </Txt>
                {gap === null ? null : (
                  <Txt variant="caption" color="faint" tabular numberOfLines={1}>
                    {gap}
                  </Txt>
                )}
              </View>

              {right === undefined
                ? null
                : bar(pair.rightKey, t('sideRight'), right, diff === null || diff >= 0)}
              {left === undefined
                ? null
                : bar(pair.leftKey, t('sideLeft'), left, diff === null || diff <= 0)}
            </View>
          );
        })}

        {trunk === undefined ? null : (
          <View style={styles.pair}>{bar('trunk', t('segmentTrunk'), trunk, true)}</View>
        )}
      </View>
    );
  };

  // Both groups are drawn in ink: the screen's one accent belongs to the
  // headline figure, and muscle still leads here because it is the darker tone.
  const leanGroup = group('leanMass', scan.segmentalLeanKg, previous?.segmentalLeanKg, colors.text);
  const fatGroup = group('fatMass', scan.segmentalFatKg, previous?.segmentalFatKg, colors.textFaint);
  if (!leanGroup && !fatGroup) return null;

  return (
    <View style={style}>
      {leanGroup}
      {fatGroup}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginTop: spacing.lg,
  },
  groupHead: {
    alignItems: 'baseline',
    columnGap: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  groupTitle: {
    flexShrink: 1,
  },
  pair: {
    marginTop: spacing.md,
  },
  pairHead: {
    alignItems: 'baseline',
    columnGap: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  pairTitle: {
    flexShrink: 1,
  },
  row: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    minHeight: 26,
  },
  rowLabel: {
    width: 46,
  },
  track: {
    borderRadius: radius.pill,
    flexGrow: 1,
    flexShrink: 1,
    height: BAR_HEIGHT,
    overflow: 'hidden',
  },
  bar: {
    borderRadius: radius.pill,
    height: BAR_HEIGHT,
  },
  rowValue: {
    width: 50,
  },
  rowDelta: {
    width: 46,
  },
});
