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
import { formatAmount } from '@/domain/format';
import { radius, spacing, useTheme } from '@/theme';
import type { ScanRange } from '@/types';

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

/** A thin mark reads as a measurement; a thick one reads as a control. */
const TRACK_HEIGHT = 8;
const MARKER_HEIGHT = 18;
/** Air either side of the drawn span, so a marker at an end still reads. */
const PAD_FRACTION = 0.14;

type RangeStatus = 'rangeWithin' | 'rangeAbove' | 'rangeBelow';

export interface RangeBarProps {
  label: string;
  value: number;
  /** Decimals for the figure; the band is printed to the same precision. */
  decimals?: number;
  /** Already translated, e.g. 'kg'. Omitted for a bare index. */
  unit?: string;
  /** The normal band the machine printed. Absent when the sheet printed none. */
  range?: ScanRange;
  style?: StyleProp<ViewStyle>;
}

function statusOf(value: number, range: ScanRange): RangeStatus {
  if (value > range.max) return 'rangeAbove';
  if (value < range.min) return 'rangeBelow';
  return 'rangeWithin';
}

/**
 * One line of the machine's composition table: the figure, and where it sits
 * against the normal band printed beside it.
 *
 * The band is a quiet wash rather than a traffic light. Sitting above it is not
 * a fault — protein and minerals above the band are the good news on this
 * sheet — so only the marker changes colour, and nothing here is red.
 */
export function RangeBar({ label, value, decimals = 1, unit, range, style }: RangeBarProps) {
  const { t } = useTranslation('profile');
  const { colors } = useTheme();

  const shown = formatAmount(value, decimals);
  const status = range ? statusOf(value, range) : null;

  // The scale always holds both the band and the value, so a reading far
  // outside the band still lands on the track instead of past its end.
  const geometry = range
    ? (() => {
        const low = Math.min(range.min, value);
        const high = Math.max(range.max, value);
        const pad = Math.max((high - low) * PAD_FRACTION, 0.05);
        const from = low - pad;
        const span = high + pad - from;
        const at = (n: number) => ((n - from) / span) * 100;
        const bandStart = at(range.min);
        return { bandStart, bandEnd: at(range.max), marker: at(value) };
      })()
    : null;

  const bandText = range
    ? t('rangeBand', {
        low: formatAmount(range.min, decimals),
        high: formatAmount(range.max, decimals),
        unit: unit ?? '',
      }).trim()
    : '';

  const caption =
    status === null ? t('rangeNone') : `${bandText}${bandText ? ' · ' : ''}${t(status)}`;

  const spoken =
    status === null
      ? t('rangeSpokenPlain', { label, value: shown, unit: unit ?? '' }).trim()
      : t('rangeSpoken', {
          label,
          value: shown,
          unit: unit ?? '',
          band: bandText,
          status: t(status),
        });

  return (
    <View accessible accessibilityLabel={spoken} style={[styles.wrap, style]}>
      <View style={styles.head}>
        <Txt numberOfLines={1} style={styles.label}>
          {label}
        </Txt>
        {/* The figure and its unit are one run: as siblings Arabic reorders them. */}
        <Txt tabular numberOfLines={1} align="end" style={styles.value}>
          {shown}
          {unit ? (
            <Txt variant="label" color="faint">
              {` ${unit}`}
            </Txt>
          ) : null}
        </Txt>
      </View>

      {geometry ? (
        <View style={styles.scale} {...DECORATIVE}>
          <View style={[styles.track, { backgroundColor: colors.track }]}>
            <View
              style={[
                styles.band,
                {
                  backgroundColor: colors.successSoft,
                  start: `${geometry.bandStart}%`,
                  width: `${Math.max(0, geometry.bandEnd - geometry.bandStart)}%`,
                },
              ]}
            />
          </View>
          <View
            style={[
              styles.edge,
              { backgroundColor: colors.borderStrong, start: `${geometry.bandStart}%` },
            ]}
          />
          <View
            style={[
              styles.edge,
              { backgroundColor: colors.borderStrong, start: `${geometry.bandEnd}%` },
            ]}
          />
          <View
            style={[
              styles.marker,
              {
                backgroundColor: status === 'rangeWithin' ? colors.success : colors.text,
                start: `${geometry.marker}%`,
              },
            ]}
          />
        </View>
      ) : null}

      <Txt
        variant="caption"
        color={status === 'rangeWithin' ? 'muted' : 'faint'}
        numberOfLines={2}
        tabular
        style={styles.caption}
      >
        {caption}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: spacing.sm,
  },
  head: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    flexShrink: 1,
  },
  value: {
    flexShrink: 0,
  },
  scale: {
    height: MARKER_HEIGHT,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  track: {
    borderRadius: radius.pill,
    height: TRACK_HEIGHT,
    overflow: 'hidden',
    width: '100%',
  },
  band: {
    bottom: 0,
    position: 'absolute',
    top: 0,
  },
  // The band edges are drawn over the track only, never as tall as the marker:
  // they say where the band ends, they are not a second reading.
  edge: {
    height: TRACK_HEIGHT,
    position: 'absolute',
    top: (MARKER_HEIGHT - TRACK_HEIGHT) / 2,
    width: 1,
  },
  marker: {
    borderRadius: radius.pill,
    height: MARKER_HEIGHT,
    marginStart: -1,
    position: 'absolute',
    top: 0,
    width: 2,
  },
  caption: {
    marginTop: spacing.xs + 2,
  },
});
