import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, useTheme } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type IconButtonVariant = 'plain' | 'surface' | 'accent' | 'danger';

export interface IconButtonProps {
  /** Ionicons glyph name. */
  icon: string;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  /** Glyph size in points; the tap target grows to stay at least 44x44. */
  size?: number;
  /** Overrides the glyph colour picked from the variant. */
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const MIN_TARGET = 44;

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'plain',
  size = 22,
  color,
  disabled = false,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();

  // The disc is sized to the glyph; the tap target is padded out to 44 around it,
  // with hitSlop covering whatever a caller's own style trims away.
  const disc = Math.round(size + 16);
  const box = Math.max(MIN_TARGET, disc);
  const slop = Math.max(6, Math.ceil((MIN_TARGET - disc) / 2));

  const palette = {
    plain: { bg: 'transparent', fg: colors.text, pressed: colors.surfaceAlt },
    surface: { bg: colors.surfaceAlt, fg: colors.text, pressed: colors.border },
    accent: { bg: colors.accent, fg: colors.accentText, pressed: colors.accent },
    danger: { bg: colors.surfaceAlt, fg: colors.danger, pressed: colors.border },
  }[variant];

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => undefined);
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={slop}
      style={({ pressed }) => [
        styles.button,
        { height: box, width: box },
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.disc,
            {
              backgroundColor: pressed && !disabled ? palette.pressed : palette.bg,
              borderRadius: variant === 'plain' ? radius.md : radius.pill,
              height: disc,
              width: disc,
            },
          ]}
        >
          <Ionicons name={icon as IconName} size={size} color={color ?? palette.fg} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
  disabled: {
    opacity: 0.4,
  },
});
