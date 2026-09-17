import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { Txt } from './Txt';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Ionicons glyph shown above the label. */
  icon?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  /**
   * NoInfer keeps the handler out of inference, so `onChange={setSex}` cannot
   * widen T to plain string. Method syntax keeps narrower handlers assignable.
   */
  onChange(v: NoInfer<T>): void;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  const { colors, isDark } = useTheme();

  // The raised segment must be lighter than its track in either theme.
  const trackColor = isDark ? colors.surface : colors.surfaceAlt;
  const raisedColor = isDark ? colors.surfaceAlt : colors.surface;

  const handlePress = (next: T) => {
    if (next === value) return;
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => undefined);
    }
    onChange(next);
  };

  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.track, { backgroundColor: trackColor, borderColor: colors.border }, style]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => handlePress(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, checked: selected }}
            style={({ pressed }) => [
              styles.segment,
              selected
                ? { backgroundColor: raisedColor, borderColor: colors.border }
                : styles.segmentIdle,
              pressed && !selected ? styles.pressed : null,
            ]}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon as IconName}
                size={16}
                color={selected ? colors.accent : colors.textFaint}
              />
            ) : null}
            <Txt
              variant="label"
              weight={selected ? 'semibold' : 'medium'}
              color={selected ? 'text' : 'muted'}
              numberOfLines={1}
              align="center"
            >
              {option.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    padding: spacing.xs,
  },
  segment: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexBasis: 0,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    rowGap: 2,
  },
  segmentIdle: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  pressed: {
    opacity: 0.6,
  },
});
