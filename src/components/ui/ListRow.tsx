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

import { mirrorIcon, useDirection } from '@/i18n';
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
  /** Ionicons glyph at the leading edge. Drawn flat unless `iconBubble` is on. */
  icon?: string;
  /** Puts the leading glyph back in a tonal bubble, for rows that are objects. */
  iconBubble?: boolean;
  /** Indents the row from its container. Off by default: the page has a gutter. */
  inset?: boolean;
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
  iconBubble = false,
  inset = false,
  destructive = false,
  chevron = false,
  style,
}: ListRowProps) {
  const { colors } = useTheme();
  const { isRTL } = useDirection();
  const titleColor = destructive ? colors.danger : colors.text;
  const splitRight = Boolean(onPress) && isInteractive(right);
  const glyphColor = destructive ? colors.danger : colors.textMuted;

  const leading =
    left ??
    (icon ? (
      iconBubble ? (
        <View style={[styles.bubble, { backgroundColor: colors.surfaceAlt }]} {...DECORATIVE}>
          <Ionicons name={icon as IconName} size={17} color={glyphColor} />
        </View>
      ) : (
        <View style={styles.glyph} {...DECORATIVE}>
          <Ionicons name={icon as IconName} size={19} color={glyphColor} />
        </View>
      )
    ) : null);

  const text = (
    <View style={styles.text}>
      {/* Size and colour separate the two lines; the title needs no extra weight. */}
      <Txt color={titleColor} numberOfLines={1}>
        {title}
      </Txt>
      {subtitle ? (
        <Txt variant="label" color="muted" numberOfLines={2} style={styles.subtitle}>
          {subtitle}
        </Txt>
      ) : null}
    </View>
  );

  // The chevron points the way the row opens, which is the reading direction.
  const chevronNode = chevron ? (
    <View {...DECORATIVE}>
      <Ionicons
        name={mirrorIcon('chevron-forward', isRTL) as IconName}
        size={16}
        color={colors.textFaint}
      />
    </View>
  ) : null;

  const label = subtitle ? `${title}. ${subtitle}` : title;
  const pad = inset ? styles.rowInset : styles.rowFlush;

  if (!onPress) {
    return (
      <View style={[styles.row, pad, style]}>
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
          pad,
          pressed ? [styles.pressed, { backgroundColor: colors.surfaceAlt }] : null,
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
    <View style={[styles.row, inset ? styles.splitInset : null, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.row,
          styles.tapTarget,
          inset ? styles.tapTargetInset : null,
          pressed ? [styles.pressed, { backgroundColor: colors.surfaceAlt }] : null,
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
  rowFlush: {
    paddingVertical: spacing.md,
  },
  rowInset: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  splitInset: {
    paddingEnd: spacing.md,
  },
  tapTarget: {
    alignSelf: 'stretch',
    flex: 1,
    paddingVertical: spacing.md,
  },
  tapTargetInset: {
    paddingStart: spacing.lg,
  },
  pressed: {
    borderRadius: radius.md,
  },
  bubble: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  glyph: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
  },
  text: {
    flex: 1,
    justifyContent: 'center',
  },
  subtitle: {
    marginTop: 2,
  },
});
