import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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

export interface OptionRowProps {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  /** Ionicons glyph at the leading edge. */
  icon?: string;
  /** Replaces the radio dot, e.g. with a value or a Badge. */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function OptionRow({
  title,
  subtitle,
  selected,
  onPress,
  icon,
  right,
  style,
}: OptionRowProps) {
  const { colors } = useTheme();

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => undefined);
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="radio"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityState={{ selected, checked: selected }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected ? colors.accentSoft : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
        },
        pressed ? [styles.pressed, { backgroundColor: colors.surfaceAlt }] : null,
        style,
      ]}
    >
      {icon ? (
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: selected ? colors.surface : colors.surfaceAlt },
          ]}
          {...DECORATIVE}
        >
          <Ionicons
            name={icon as IconName}
            size={18}
            color={selected ? colors.accent : colors.textMuted}
          />
        </View>
      ) : null}

      <View style={styles.text}>
        <Txt weight="semibold" numberOfLines={2}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="label" color="muted" style={styles.subtitle}>
            {subtitle}
          </Txt>
        ) : null}
      </View>

      {right ?? (
        <View
          style={[styles.radio, { borderColor: selected ? colors.accent : colors.border }]}
          {...DECORATIVE}
        >
          {selected ? <View style={[styles.dot, { backgroundColor: colors.accent }]} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  text: {
    flex: 1,
  },
  subtitle: {
    marginTop: 2,
  },
  radio: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  dot: {
    borderRadius: radius.pill,
    height: 10,
    width: 10,
  },
});
