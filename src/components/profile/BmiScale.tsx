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

import { Badge, Txt, type BadgeTone } from '@/components/ui';
import { formatAmount } from '@/domain/format';
import { radius, spacing, useTheme } from '@/theme';

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

/** Ends of the scale drawn under the BMI number, and the band edges inside it. */
const BMI_SCALE = { min: 15, max: 40 };
const BMI_BANDS: { key: string; from: number; to: number; healthy: boolean }[] = [
  { key: 'under', from: 15, to: 18.5, healthy: false },
  { key: 'healthy', from: 18.5, to: 25, healthy: true },
  { key: 'over', from: 25, to: 30, healthy: false },
  { key: 'high', from: 30, to: 40, healthy: false },
];
const BMI_TICKS = [18.5, 25, 30];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Where a BMI value sits on the drawn scale, as a 0..1 fraction. */
const bmiOffset = (value: number) =>
  clamp01((value - BMI_SCALE.min) / (BMI_SCALE.max - BMI_SCALE.min));

export interface BmiScaleProps {
  bmi: number;
  /** Already translated band name, e.g. 'Overweight'. */
  categoryLabel: string;
  tone: BadgeTone;
  style?: StyleProp<ViewStyle>;
}

/**
 * The BMI figure, the band it falls in, and where it sits on the scale between
 * the two. It lives here rather than on one screen because the profile and the
 * reading both print it, and two copies of a drawn scale drift apart.
 */
export function BmiScale({ bmi, categoryLabel, tone, style }: BmiScaleProps) {
  const { t } = useTranslation('profile');
  const { colors } = useTheme();

  return (
    <View style={style}>
      <View style={styles.header}>
        <Txt
          accessible
          accessibilityLabel={t('bmiSpoken', {
            value: formatAmount(bmi),
            category: categoryLabel,
          })}
          variant="metric"
          tabular
          numberOfLines={1}
        >
          {formatAmount(bmi)}
          {/* The unit ends in a digit, so it must never be a separate element. */}
          <Txt variant="label" color="faint">
            {` ${t('bmiUnit')}`}
          </Txt>
        </Txt>
        <Badge label={categoryLabel} tone={tone} variant="plain" />
      </View>

      {/*
        The whole scale is pinned left to right, in both languages.

        Measured in the Arabic build: a row of flex children follows the page
        direction and mirrors, while `start` on an absolutely positioned child
        does not — so the bands ran one way and the marker and the ticks ran
        the other, and 18.5 sat under the obese end of the scale. It only
        looked plausible at a BMI near the middle of the range.

        Rather than mirror three things in step, the axis declares its own
        direction once. A value axis reads the way the digits on it read, which
        is also how the trend chart and every range bar in the app already
        read, so no two scales on one screen can disagree again.
      */}
      <View style={styles.axis} {...DECORATIVE}>
      <View style={styles.scale}>
        <View style={styles.track}>
          {BMI_BANDS.map((band) => (
            <View
              key={band.key}
              style={{
                backgroundColor: band.healthy ? colors.borderStrong : colors.track,
                flex: band.to - band.from,
              }}
            />
          ))}
        </View>
        <View
          style={[styles.marker, { backgroundColor: colors.text, start: `${bmiOffset(bmi) * 100}%` }]}
        />
      </View>

      {/* The figure is placed by the View around it: a text node carries
          dir="auto" and a run of bare digits has nothing in it to resolve
          that, so it is not something to hang a position on. */}
      <View style={styles.ticks}>
        {BMI_TICKS.map((tick) => (
          <View key={tick} style={[styles.tick, { start: `${bmiOffset(tick) * 100}%` }]}>
            <Txt variant="caption" color="faint" align="center" tabular>
              {formatAmount(tick)}
            </Txt>
          </View>
        ))}
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axis: {
    direction: 'ltr',
    marginTop: spacing.lg,
  },
  scale: {
    height: 18,
    justifyContent: 'center',
  },
  track: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  marker: {
    borderRadius: radius.pill,
    height: 18,
    marginStart: -1,
    position: 'absolute',
    top: 0,
    width: 2,
  },
  ticks: {
    height: 16,
    marginTop: spacing.sm,
  },
  tick: {
    marginStart: -18,
    position: 'absolute',
    top: 0,
    width: 36,
  },
});
