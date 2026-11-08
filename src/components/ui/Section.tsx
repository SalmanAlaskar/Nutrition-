import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { layout, spacing, useTheme } from '@/theme';

import { Txt } from './Txt';

/** How much air sits between the heading and the body of the section. */
export type SectionGap = 'none' | 'tight' | 'normal';

export interface SectionProps {
  /** Heading for the group. Omit for a group that needs rhythm but no title. */
  title?: string;
  /** One quiet line under the title. */
  subtitle?: string;
  /** Trailing control in the header, e.g. an IconButton. Wins over actionLabel. */
  action?: React.ReactNode;
  /** Convenience text action at the end of the header, e.g. "See all". */
  actionLabel?: string;
  /** Required for `actionLabel` to be drawn. */
  onAction?: () => void;
  /** Spoken hint for the convenience action. */
  actionHint?: string;
  /** First section on a screen: no space is added above it. */
  first?: boolean;
  /** A hairline above the section, for the rare break that space cannot carry. */
  divider?: boolean;
  /** Gap between the heading and the body. */
  gap?: SectionGap;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

const GAP: Record<SectionGap, number> = {
  none: 0,
  tight: spacing.sm,
  normal: layout.headerGap,
};

/**
 * The unit of rhythm for every screen. The space above a section is far larger
 * than any space inside it, which is what lets the app group without borders.
 */
export function Section({
  title,
  subtitle,
  action,
  actionLabel,
  onAction,
  actionHint,
  first = false,
  divider = false,
  gap = 'normal',
  children,
  style,
  contentStyle,
}: SectionProps) {
  const { colors } = useTheme();

  const trailing =
    action ??
    (actionLabel && onAction ? (
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        accessibilityHint={actionHint}
        hitSlop={{ top: 12, bottom: 12, left: spacing.sm, right: spacing.sm }}
        style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
      >
        <Txt variant="label" color="muted" numberOfLines={1}>
          {actionLabel}
        </Txt>
      </Pressable>
    ) : null);

  const hasHeader = Boolean(title || subtitle || trailing);

  return (
    <View
      style={[
        first ? null : styles.spaced,
        divider ? [styles.divided, { borderColor: colors.border }] : null,
        style,
      ]}
    >
      {hasHeader ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title ? (
              <Txt variant="heading" numberOfLines={2} accessibilityRole="header">
                {title}
              </Txt>
            ) : null}
            {subtitle ? (
              <Txt
                variant="label"
                color="muted"
                numberOfLines={2}
                style={[styles.subtitle, title ? null : styles.subtitleAlone]}
              >
                {subtitle}
              </Txt>
            ) : null}
          </View>
          {trailing}
        </View>
      ) : null}

      {children ? (
        <View style={[hasHeader ? { marginTop: GAP[gap] } : null, contentStyle]}>{children}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  spaced: {
    marginTop: layout.sectionGap,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.xl,
  },
  header: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    // A heading is read, not tapped, so it keeps the height of its own type.
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
  },
  subtitle: {
    marginTop: 2,
  },
  subtitleAlone: {
    marginTop: 0,
  },
  action: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 24,
  },
  pressed: {
    opacity: 0.6,
  },
});
