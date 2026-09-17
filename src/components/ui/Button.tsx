import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
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

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ionicons glyph shown before the label. */
  icon?: string;
  /** Ionicons glyph shown after the label. */
  iconRight?: string;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<ButtonSize, { height: number; padding: number; icon: number; font: number }> = {
  sm: { height: 38, padding: spacing.lg, icon: 16, font: fontSize.sm },
  md: { height: 48, padding: spacing.xl, icon: 18, font: fontSize.md },
  lg: { height: 56, padding: spacing.xl, icon: 20, font: fontSize.lg },
};

const MIN_TARGET = 44;

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityHint,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const metrics = SIZES[size];
  const inert = disabled || loading;

  const palette = {
    primary: { bg: colors.accent, border: colors.accent, fg: colors.accentText },
    secondary: { bg: colors.surfaceAlt, border: colors.border, fg: colors.text },
    ghost: { bg: 'transparent', border: 'transparent', fg: colors.accent },
    danger: { bg: 'transparent', border: colors.danger, fg: colors.danger },
  }[variant];

  // Pressing shifts the surface a step as well as dimming, so the state is felt
  // on filled and transparent variants alike.
  const pressedBg = {
    primary: colors.accent,
    secondary: colors.surface,
    ghost: colors.surfaceAlt,
    danger: colors.surfaceAlt,
  }[variant];

  // A short button keeps its drawn height but never a target under 44pt.
  const slop = Math.max(0, Math.ceil((MIN_TARGET - metrics.height) / 2));

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => undefined);
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inert, busy: loading }}
      hitSlop={{ top: slop, bottom: slop, left: spacing.sm, right: spacing.sm }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          height: metrics.height,
          paddingHorizontal: metrics.padding,
        },
        fullWidth ? styles.fullWidth : styles.hug,
        pressed && !inert ? [styles.pressed, { backgroundColor: pressedBg }] : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <View style={[styles.content, loading ? styles.hidden : null]}>
        {icon ? (
          <View {...DECORATIVE}>
            <Ionicons name={icon as IconName} size={metrics.icon} color={palette.fg} />
          </View>
        ) : null}
        <Txt
          weight="semibold"
          color={palette.fg}
          numberOfLines={1}
          style={{ fontSize: metrics.font }}
        >
          {label}
        </Txt>
        {iconRight ? (
          <View {...DECORATIVE}>
            <Ionicons name={iconRight as IconName} size={metrics.icon} color={palette.fg} />
          </View>
        ) : null}
      </View>
      {loading ? (
        <View style={[StyleSheet.absoluteFill, styles.loader]}>
          <ActivityIndicator size="small" color={palette.fg} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: MIN_TARGET,
  },
  hug: {
    alignSelf: 'flex-start',
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  content: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  hidden: {
    opacity: 0,
  },
  loader: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.45,
  },
});
