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
import { segmentalBalance } from '@/domain/bodyScan';
import { formatAmount } from '@/domain/format';
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

const BAR_HEIGHT = 10;
/** The lighter side of a pair, so the heavier one reads as the heavier one. */
const LIGHT_SIDE_OPACITY = 0.4;
/** Below this many kilograms the two sides are the same reading, not a gap. */
const EVEN_KG = 0.1;
/** Keeps a very small bar visible at all. */
const MIN_BAR_FRACTION = 0.06;

/** Right and left of one limb pair, drawn together because the gap is the point. */
interface Pair {
  id: 'arms' | 'legs';
  titleKey: 'pairArms' | 'pairLegs';
  right?: number;
  left?: number;
}

function value(values: SegmentalValues, key: keyof SegmentalValues): number | undefined {
  const raw = values[key];
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

/**
 * Segmental muscle, and fat when the sheet carried it. Each limb pair is drawn
 * as two bars on one scale with the gap between them spelled out, so a side that
 * reads lighter is visible without reading a single number.
 */
export function SegmentalChart({ scan, style }: SegmentalChartProps) {
  const { t } = useTranslation(['body', 'units']);
  const { colors } = useTheme();

  const balance = segmentalBalance(scan);
  const kg = t('units:kg');

  const group = (
    titleKey: 'leanMass' | 'fatMass',
    values: SegmentalValues | undefined,
    color: string,
  ) => {
    if (!values) return null;

    const allPairs: Pair[] = [
      {
        id: 'arms',
        titleKey: 'pairArms',
        right: value(values, 'rightArm'),
        left: value(values, 'leftArm'),
      },
      {
        id: 'legs',
        titleKey: 'pairLegs',
        right: value(values, 'rightLeg'),
        left: value(values, 'leftLeg'),
      },
    ];
    const pairs = allPairs.filter((pair) => pair.right !== undefined || pair.left !== undefined);
    const trunk = value(values, 'trunk');
    if (pairs.length === 0 && trunk === undefined) return null;

    const bar = (
      key: string,
      label: string,
      amount: number,
      max: number,
      heavier: boolean,
      partLabel: string,
    ) => {
      const fraction = max > 0 ? Math.max(MIN_BAR_FRACTION, amount / max) : MIN_BAR_FRACTION;
      const text = `${formatAmount(amount, 2)} ${kg}`;
      return (
        <View
          key={key}
          accessible
          accessibilityLabel={t('segmentSpoken', { part: partLabel, value: text })}
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
          <Txt variant="label" weight="semibold" tabular align="end" style={styles.rowValue}>
            {formatAmount(amount, 2)}
          </Txt>
        </View>
      );
    };

    return (
      <View style={styles.group}>
        <Txt variant="caption" color="faint" weight="bold" style={styles.groupTitle}>
          {`${t(titleKey)} (${kg})`.toUpperCase()}
        </Txt>

        {pairs.map((pair) => {
          const right = pair.right;
          const left = pair.left;
          const max = Math.max(right ?? 0, left ?? 0);
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
                <Txt variant="label" weight="semibold" numberOfLines={1} style={styles.pairTitle}>
                  {t(pair.titleKey)}
                </Txt>
                {gap === null ? null : (
                  <Txt
                    variant="caption"
                    weight="semibold"
                    color={diff !== null && Math.abs(diff) < EVEN_KG ? 'faint' : 'warning'}
                    tabular
                    numberOfLines={1}
                  >
                    {gap}
                  </Txt>
                )}
              </View>
              {right === undefined
                ? null
                : bar(
                    `${pair.id}-right`,
                    t('sideRight'),
                    right,
                    max,
                    diff === null || diff >= 0,
                    t(pair.id === 'arms' ? 'segmentRightArm' : 'segmentRightLeg'),
                  )}
              {left === undefined
                ? null
                : bar(
                    `${pair.id}-left`,
                    t('sideLeft'),
                    left,
                    max,
                    diff === null || diff <= 0,
                    t(pair.id === 'arms' ? 'segmentLeftArm' : 'segmentLeftLeg'),
                  )}
            </View>
          );
        })}

        {trunk === undefined ? null : (
          <View style={styles.pair}>
            {bar('trunk', t('segmentTrunk'), trunk, trunk, true, t('segmentTrunk'))}
          </View>
        )}
      </View>
    );
  };

  const leanGroup = group('leanMass', scan.segmentalLeanKg, colors.accent);
  const fatGroup = group('fatMass', scan.segmentalFatKg, colors.fat);
  if (!leanGroup && !fatGroup) return null;

  const sentence = (diff: number, part: 'arms' | 'legs'): string => {
    if (Math.abs(diff) < EVEN_KG) return t(part === 'arms' ? 'balanceArmsEven' : 'balanceLegsEven');
    const amount = `${formatAmount(Math.abs(diff), 2)} ${kg}`;
    if (part === 'arms') {
      return t(diff > 0 ? 'balanceArmsRight' : 'balanceArmsLeft', { amount });
    }
    return t(diff > 0 ? 'balanceLegsRight' : 'balanceLegsLeft', { amount });
  };

  return (
    <View style={style}>
      {leanGroup}
      {fatGroup}

      {balance ? (
        <Txt variant="label" color="muted" style={styles.balance}>
          {`${sentence(balance.armDiff, 'arms')} ${sentence(balance.legDiff, 'legs')}`}
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
  pair: {
    marginBottom: spacing.md,
  },
  pairHead: {
    alignItems: 'center',
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
    minHeight: 24,
  },
  rowLabel: {
    width: 54,
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
    minWidth: 48,
  },
  balance: {
    marginTop: spacing.sm,
  },
});
