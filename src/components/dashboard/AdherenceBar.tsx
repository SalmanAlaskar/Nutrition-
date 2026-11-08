import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { Txt } from '@/components/ui';
import { formatCount } from '@/domain/format';
import { layout, radius, spacing, useTheme } from '@/theme';

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

export interface AdherenceBarProps {
  /** Days that landed inside the band around the calorie target. */
  hit: number;
  /** Days with at least one meal logged in the window. */
  logged: number;
  /** Half-width of the band, as a percentage of the target. */
  band: number;
  style?: StyleProp<ViewStyle>;
}

/** A rail reads as a share of a whole without drawing a chart. */
const RAIL_HEIGHT = 5;

/**
 * How many logged days landed near the calorie target: a figure, a sentence
 * and a rail.
 *
 * The denominator is days that were logged, not days in the window, so a quiet
 * week reads as a small sample rather than as a failure. It borrows the hero's
 * shape one step quieter — ink instead of the accent — because a second circle
 * on this page would read as a chart arguing with the number at the top.
 */
export function AdherenceBar({ hit, logged, band, style }: AdherenceBarProps) {
  const { t } = useTranslation('dashboard');
  const { colors } = useTheme();

  const share = logged > 0 ? Math.min(1, Math.max(0, hit / logged)) : 0;

  return (
    <View
      accessible
      accessibilityLabel={t('adherenceSpoken', {
        hit: formatCount(hit),
        logged: formatCount(logged),
        band: formatCount(band),
      })}
      style={style}
    >
      {/* One run, and no space around the slash: as separate elements the two
          figures collide in Arabic and read as a single longer number. */}
      <Txt variant="metric" tabular numberOfLines={1} style={styles.figure}>
        {formatCount(hit)}
        <Txt variant="label" color="faint" weight="medium">
          {`/${formatCount(logged)}`}
        </Txt>
      </Txt>

      <Txt variant="label" color="muted" numberOfLines={3} style={styles.caption}>
        {t('adherenceCaption', { band: formatCount(band) })}
      </Txt>

      <View style={[styles.rail, { backgroundColor: colors.track }]} {...DECORATIVE}>
        <View
          style={[styles.fill, { backgroundColor: colors.textMuted, width: `${share * 100}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  figure: {
    // A figure never shrinks or wraps to fit.
    flexShrink: 0,
    /*
      Shrink-wrapped on purpose. A run of digits carries no strong direction,
      so the web reads it left to right and a logical text alignment would pin
      it to the wrong edge in Arabic. Sized to its own content, the figure is
      placed by the column instead, which does follow the page direction.
    */
    alignSelf: 'flex-start',
  },
  caption: {
    marginTop: spacing.xs,
    maxWidth: layout.maxTextWidth,
  },
  rail: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: RAIL_HEIGHT,
    marginTop: spacing.lg,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
  },
});
