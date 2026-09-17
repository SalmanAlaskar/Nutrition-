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

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Custom leading node; takes precedence over `icon`. */
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  /** Ionicons glyph shown in a leading bubble. */
  icon?: string;
  /** Paints the title and icon with the danger colour. */
  destructive?: boolean;
  chevron?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A right slot that can be tapped has to sit beside the row's Pressable, never
 * inside it: nested pressables render a <button> in a <button> on web and swallow
 * clicks. Anything inert (a value, a Badge, a chevron) stays in the tap target.
 */
function isInteractive(node: React.ReactNode): boolean {
  if (!React.isValidElement(node)) return false;
  const props = node.props as { onPress?: unknown; children?: React.ReactNode };
  if (typeof props.onPress === 'function') return true;
  return React.Children.toArray(props.children).some(isInteractive);
}

export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  icon,
  destructive = false,
  chevron = false,
  style,
}: ListRowProps) {
  const { colors } = useTheme();
  const titleColor = destructive ? colors.danger : colors.text;
  const splitRight = Boolean(onPress) && isInteractive(right);

  const leading =
    left ??
    (icon ? (
      <View style={[styles.bubble, { backgroundColor: colors.surfaceAlt }]} {...DECORATIVE}>
        <Ionicons
          name={icon as IconName}
          size={18}
          color={destructive ? colors.danger : colors.textMuted}
        />
      </View>
    ) : null);

  const text = (
    <View style={styles.text}>
      <Txt weight="semibold" color={titleColor} numberOfLines={1}>
        {title}
      </Txt>
      {subtitle ? (
        <Txt variant="label" color="muted" numberOfLines={2} style={styles.subtitle}>
          {subtitle}
        </Txt>
      ) : null}
    </View>
  );

  const chevronNode = chevron ? (
    <View {...DECORATIVE}>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </View>
  ) : null;

  const label = subtitle ? `${title}. ${subtitle}` : title;

  if (!onPress) {
    return (
      <View style={[styles.row, styles.rowPadded, style]}>
        {leading}
        {text}
        {right}
        {chevronNode}
      </View>
    );
  }

  if (!splitRight) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.row,
          styles.rowPadded,
          pressed ? { backgroundColor: colors.surfaceAlt } : null,
          style,
        ]}
      >
        {leading}
        {text}
        {right}
        {chevronNode}
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, styles.rowSplit, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.row,
          styles.tapTarget,
          pressed ? { backgroundColor: colors.surfaceAlt } : null,
        ]}
      >
        {leading}
        {text}
        {chevronNode}
      </Pressable>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 56,
  },
  rowPadded: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowSplit: {
    paddingRight: spacing.md,
  },
  tapTarget: {
    alignSelf: 'stretch',
    flex: 1,
    paddingLeft: spacing.lg,
    paddingVertical: spacing.md,
  },
  bubble: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  text: {
    flex: 1,
    justifyContent: 'center',
  },
  subtitle: {
    marginTop: 2,
  },
});
