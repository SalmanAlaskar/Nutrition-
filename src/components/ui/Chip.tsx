import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Platform,
  Pressable,
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

/**
 * A filter row is never the most important thing on a screen, so a selected
 * chip reads as ink on a tone by default. 'accent' is there for the rare chip
 * row that *is* the screen's one accent.
 */
export type ChipTone = 'neutral' | 'accent';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Ionicons glyph before the label. */
  icon?: string;
  /** Accent colour for the selected state; defaults to the theme accent. */
  color?: string;
  /** How the selected state is coloured. Defaults to ink on a tone. */
  tone?: ChipTone;
  style?: StyleProp<ViewStyle>;
}

/** A chip carrying a figure gets locked digit widths so a filter row never jitters. */
const HAS_DIGIT = /\d/;

const MIN_TARGET = 44;
const CHIP_HEIGHT = 34;
/** The chip stays compact; the slop is what carries the target to 44 points. */
const VERTICAL_SLOP = Math.ceil((MIN_TARGET - CHIP_HEIGHT) / 2);

export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  color,
  tone = 'neutral',
  style,
}: ChipProps) {
  const { colors } = useTheme();

  // An explicit colour always wins: that is how a macro chip keeps its macro.
  const selectedColor = color ?? (tone === 'accent' ? colors.accent : colors.text);
  const foreground = selected ? selectedColor : colors.textMuted;
  const background = selected
    ? tone === 'accent' && !color
      ? colors.accentSoft
      : colors.surfaceAlt
    : 'transparent';
  const borderColor = selected ? colors.borderStrong : colors.border;

  const body = (
    <>
      {icon ? (
        <View {...DECORATIVE}>
          <Ionicons name={icon as IconName} size={14} color={foreground} />
        </View>
      ) : null}
      <Txt
        variant="label"
        weight={selected ? 'semibold' : 'regular'}
        color={foreground}
        numberOfLines={1}
        tabular={HAS_DIGIT.test(label)}
      >
        {label}
      </Txt>
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.chip, { backgroundColor: background, borderColor }, style]}>{body}</View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={{ top: VERTICAL_SLOP, bottom: VERTICAL_SLOP, left: spacing.sm, right: spacing.sm }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: background, borderColor },
        pressed ? [styles.pressed, { backgroundColor: colors.surfaceAlt }] : null,
        style,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    columnGap: spacing.xs + 2,
    flexDirection: 'row',
    minHeight: CHIP_HEIGHT,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm - 2,
  },
  pressed: {
    opacity: 0.75,
  },
});
