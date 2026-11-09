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

import { Divider, Txt } from '@/components/ui';
import { formatAmount, formatCount, formatDelta } from '@/domain/format';
import { radius, spacing, useTheme } from '@/theme';

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

/** The score the machine prints runs 0 to 100. */
const SCORE_MAX = 100;
const TRACK_HEIGHT = 6;
const MARKER_HEIGHT = 16;

export interface ControlSummaryProps {
  /** 0 to 100, as the machine prints it. */
  score?: number;
  /** Kilograms, exactly as the sheet printed them. */
  targetWeightKg?: number;
  /** The sheet's own suggestions, signed: negative means lose. */
  weightControlKg?: number;
  fatControlKg?: number;
  muscleControlKg?: number;
  /** Translated mass unit for the figures, e.g. 'kg'. */
  unit: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The machine's one-number summary, and the three signed figures it suggests
 * to reach the target weight. They are the machine's arithmetic, presented as
 * that: a suggestion printed on a sheet, not a prescription.
 */
export function ControlSummary({
  score,
  targetWeightKg,
  weightControlKg,
  fatControlKg,
  muscleControlKg,
  unit,
  style,
}: ControlSummaryProps) {
  const { t } = useTranslation('profile');
  const { colors } = useTheme();

  const controls = [
    { key: 'weight', labelKey: 'controlRowWeight', value: weightControlKg },
    { key: 'fat', labelKey: 'controlRowFat', value: fatControlKg },
    { key: 'muscle', labelKey: 'controlRowMuscle', value: muscleControlKg },
  ] as const;

  const shownControls = controls.filter((row) => row.value !== undefined);
  const hasControl = targetWeightKg !== undefined || shownControls.length > 0;

  const scorePosition =
    score === undefined ? 0 : Math.min(100, Math.max(0, (score / SCORE_MAX) * 100));

  return (
    <View style={style}>
      {score === undefined ? null : (
        <View>
          <View accessible accessibilityLabel={t('scoreSpoken', { value: formatCount(score) })}>
            {/* The figure and its scale are one run: two runs reorder in Arabic. */}
            <Txt variant="metric" tabular numberOfLines={1}>
              {formatCount(score)}
              <Txt variant="label" color="faint" weight="medium">
                {` ${t('scoreUnit')}`}
              </Txt>
            </Txt>
          </View>

          <View style={styles.scale} {...DECORATIVE}>
            <View style={[styles.track, { backgroundColor: colors.track }]} />
            <View
              style={[styles.marker, { backgroundColor: colors.text, start: `${scorePosition}%` }]}
            />
          </View>
        </View>
      )}

      {hasControl ? (
        <View style={score === undefined ? null : styles.controls}>
          <Txt variant="label" weight="semibold" numberOfLines={1}>
            {t('controlTitle')}
          </Txt>

          {targetWeightKg === undefined ? null : (
            <View
              accessible
              accessibilityLabel={t('controlSpoken', {
                label: t('controlTarget'),
                value: formatAmount(targetWeightKg, 1),
                unit,
              })}
              style={styles.row}
            >
              <Txt numberOfLines={1} style={styles.rowLabel}>
                {t('controlTarget')}
              </Txt>
              <Txt tabular numberOfLines={1} align="end">
                {formatAmount(targetWeightKg, 1)}
                <Txt variant="label" color="faint">
                  {` ${unit}`}
                </Txt>
              </Txt>
            </View>
          )}

          {shownControls.map((row) => (
            <View key={row.key}>
              <Divider />
              <View
                accessible
                accessibilityLabel={t('controlSpoken', {
                  label: t(row.labelKey),
                  value: formatDelta(row.value ?? 0, 1),
                  unit,
                })}
                style={styles.row}
              >
                <Txt numberOfLines={1} style={styles.rowLabel}>
                  {t(row.labelKey)}
                </Txt>
                <Txt tabular numberOfLines={1} align="end">
                  {formatDelta(row.value ?? 0, 1)}
                  <Txt variant="label" color="faint">
                    {` ${unit}`}
                  </Txt>
                </Txt>
              </View>
            </View>
          ))}

          <Txt variant="caption" color="faint" style={styles.note}>
            {t('controlNote')}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scale: {
    height: MARKER_HEIGHT,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  track: {
    borderRadius: radius.pill,
    height: TRACK_HEIGHT,
    width: '100%',
  },
  marker: {
    borderRadius: radius.pill,
    height: MARKER_HEIGHT,
    marginStart: -1,
    position: 'absolute',
    top: 0,
    width: 2,
  },
  controls: {
    marginTop: spacing.xl,
  },
  row: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 34,
    paddingVertical: spacing.sm,
  },
  rowLabel: {
    flexShrink: 1,
  },
  note: {
    marginTop: spacing.sm,
  },
});
