import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { fontSize, radius, spacing, useTheme } from '@/theme';

import { Txt } from './Txt';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

export type StatTone = 'default' | 'accent' | 'danger' | 'warning';

export interface StatTileProps {
  label: string;
  value: string | number;
  /** Small unit printed after the value, e.g. "kcal". */
  unit?: string;
  hint?: string;
  /** Ionicons glyph shown in the corner bubble. */
  icon?: string;
  tone?: StatTone;
  style?: StyleProp<ViewStyle>;
}

export function StatTile({ label, value, unit, hint, icon, tone = 'default', style }: StatTileProps) {
  const { colors } = useTheme();

  const toneColor =
    tone === 'accent'
      ? colors.accent
      : tone === 'danger'
        ? colors.danger
        : tone === 'warning'
          ? colors.warning
          : colors.textMuted;

  const spoken = [label, `${value}${unit ? ` ${unit}` : ''}`, hint].filter(Boolean).join('. ');

  return (
    <View
      accessible
      accessibilityLabel={spoken}
      style={[
        styles.tile,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      {/* A tone reads as a stripe down the leading edge, not as coloured body text. */}
      {tone !== 'default' ? (
        <View style={[styles.stripe, { backgroundColor: toneColor }]} {...DECORATIVE} />
      ) : null}

      <View style={styles.top}>
        <Txt variant="caption" color="faint" weight="bold" numberOfLines={1} style={styles.label}>
          {label.toUpperCase()}
        </Txt>
        {icon ? (
          <View
            style={[
              styles.bubble,
              { backgroundColor: tone === 'default' ? colors.surfaceAlt : colors.accentSoft },
            ]}
            {...DECORATIVE}
          >
            <Ionicons name={icon as IconName} size={14} color={toneColor} />
          </View>
        ) : null}
      </View>

      <View style={styles.valueRow}>
        <Txt
          variant="heading"
          weight="bold"
          color={tone === 'default' ? 'text' : toneColor}
          numberOfLines={1}
          tabular
          style={styles.value}
        >
          {value}
        </Txt>
        {unit ? (
          <Txt variant="caption" color="faint" weight="semibold" style={styles.unit}>
            {unit}
          </Txt>
        ) : null}
      </View>

      {hint ? (
        <Txt variant="caption" color="muted" numberOfLines={2} style={styles.hint}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 120,
    overflow: 'hidden',
    paddingBottom: spacing.lg,
    paddingStart: spacing.lg,
    paddingEnd: spacing.md,
    paddingTop: spacing.md,
  },
  stripe: {
    bottom: 0,
    position: 'absolute',
    // Logical inset: the accent stripe stays on the reading edge in Arabic.
    start: 0,
    top: 0,
    width: 3,
  },
  top: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  label: {
    flexShrink: 1,
    marginEnd: spacing.sm,
  },
  bubble: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  valueRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  value: {
    flexShrink: 1,
    fontSize: fontSize.xl + 2,
    letterSpacing: -0.6,
  },
  unit: {
    marginStart: spacing.xs + 1,
  },
  hint: {
    marginTop: spacing.xs + 2,
  },
});
