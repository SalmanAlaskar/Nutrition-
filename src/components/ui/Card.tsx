import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

/**
 * 'surface' is the default and the one to reach for: a tone, no outline.
 * 'outlined' adds the hairline back, for the rare card that has to be picked
 * out from other cards beside it. 'plain' is a bare container that only
 * supplies padding, for a group that should read as part of the page.
 */
export type CardVariant = 'surface' | 'outlined' | 'plain';

export interface CardProps {
  children?: React.ReactNode;
  onPress?: () => void;
  /** Inner padding. Turn it off to run rows edge to edge. */
  padded?: boolean;
  /** How the card separates itself from the page. Defaults to a tone. */
  variant?: CardVariant;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  onPress,
  padded = true,
  variant = 'surface',
  accessibilityLabel,
  style,
}: CardProps) {
  const { colors } = useTheme();

  const skin: ViewStyle =
    variant === 'plain'
      ? { backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0 }
      : variant === 'outlined'
        ? {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth,
          }
        : { backgroundColor: colors.surface, borderColor: 'transparent', borderWidth: 0 };

  const base: StyleProp<ViewStyle> = [styles.card, skin, padded ? styles.padded : null];

  if (!onPress) {
    return <View style={[base, style]}>{children}</View>;
  }

  const pressedColor = variant === 'plain' ? colors.surface : colors.surfaceAlt;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        base,
        pressed ? [styles.pressed, { backgroundColor: pressedColor }] : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  padded: {
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.94,
  },
});
