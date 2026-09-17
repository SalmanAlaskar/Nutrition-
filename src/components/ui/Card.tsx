import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

export interface CardProps {
  children?: React.ReactNode;
  onPress?: () => void;
  /** Inner padding. Turn it off to run rows edge to edge. */
  padded?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, onPress, padded = true, accessibilityLabel, style }: CardProps) {
  const { colors } = useTheme();

  const base: StyleProp<ViewStyle> = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: colors.border },
    padded ? styles.padded : null,
  ];

  if (!onPress) {
    return <View style={[base, style]}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        base,
        pressed ? [styles.pressed, { backgroundColor: colors.surfaceAlt }] : null,
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
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  padded: {
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
});
