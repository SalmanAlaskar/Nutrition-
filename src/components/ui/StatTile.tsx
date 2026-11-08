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

import { radius, spacing, useTheme } from '@/theme';

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
/**
 * 'plain' is the default: the figure sits on the page with nothing drawn round
 * it, and space does the grouping. 'tile' puts it back on a tonal surface, for
 * the few places a figure really is a bounded object you could point at.
 */
export type StatTileVariant = 'plain' | 'tile';

export interface StatTileProps {
  label: string;
  value: string | number;
  /** Small unit printed after the value, e.g. "kcal". */
  unit?: string;
  hint?: string;
  /** Ionicons glyph. Drawn only when `showIcon` is on; a figure rarely needs one. */
  icon?: string;
  tone?: StatTone;
  variant?: StatTileVariant;
  /** Draws `icon` beside the label. Off by default: the label already says it. */
  showIcon?: boolean;
  align?: 'start' | 'center';
  style?: StyleProp<ViewStyle>;
}

export function StatTile({
  label,
  value,
  unit,
  hint,
  icon,
  tone = 'default',
  variant = 'plain',
  showIcon = false,
  align = 'start',
  style,
}: StatTileProps) {
  const { colors } = useTheme();

  const valueColor =
    tone === 'accent'
      ? colors.accent
      : tone === 'danger'
        ? colors.danger
        : tone === 'warning'
          ? colors.warning
          : colors.text;

  const spoken = [label, `${value}${unit ? ` ${unit}` : ''}`, hint].filter(Boolean).join('. ');
  const centred = align === 'center';

  return (
    <View
      accessible
      accessibilityLabel={spoken}
      style={[
        styles.tile,
        centred ? styles.centred : null,
        variant === 'tile'
          ? [styles.boxed, { backgroundColor: colors.surface }]
          : null,
        style,
      ]}
    >
      {/*
        The figure leads. Its unit is nested inside the same text run, never a
        sibling: laid out as two elements Arabic reorders them and a unit that
        starts with a digit would glue itself onto the number.
      */}
      <Txt
        variant="metric"
        color={valueColor}
        numberOfLines={1}
        tabular
        align={centred ? 'center' : 'start'}
        style={styles.value}
      >
        {value}
        {unit ? (
          <Txt variant="label" color="faint" weight="medium">
            {` ${unit}`}
          </Txt>
        ) : null}
      </Txt>

      <View style={[styles.labelRow, centred ? styles.centredRow : null]}>
        {showIcon && icon ? (
          <View {...DECORATIVE}>
            <Ionicons name={icon as IconName} size={13} color={colors.textFaint} />
          </View>
        ) : null}
        <Txt
          variant="label"
          color="muted"
          numberOfLines={1}
          align={centred ? 'center' : 'start'}
          style={styles.label}
        >
          {label}
        </Txt>
      </View>

      {hint ? (
        <Txt
          variant="caption"
          color="faint"
          numberOfLines={2}
          align={centred ? 'center' : 'start'}
          style={styles.hint}
        >
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 104,
  },
  centred: {
    alignItems: 'center',
  },
  boxed: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  value: {
    // A figure never shrinks or wraps to fit its column.
    flexShrink: 0,
  },
  labelRow: {
    alignItems: 'center',
    columnGap: spacing.xs + 2,
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  centredRow: {
    justifyContent: 'center',
  },
  label: {
    flexShrink: 1,
  },
  hint: {
    marginTop: spacing.xs,
  },
});
