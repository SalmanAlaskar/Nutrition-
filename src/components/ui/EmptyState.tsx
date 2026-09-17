import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { Button } from './Button';
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

export interface EmptyStateProps {
  /** Ionicons glyph shown in the halo. */
  icon: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.wrapper, style]}>
      <View style={[styles.mark, { backgroundColor: colors.accentSoft }]} {...DECORATIVE}>
        <Ionicons name={icon as IconName} size={24} color={colors.accent} />
      </View>

      <Txt variant="heading" weight="bold" style={styles.title}>
        {title}
      </Txt>
      <Txt color="muted" style={styles.message}>
        {message}
      </Txt>

      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  mark: {
    alignItems: 'center',
    borderRadius: radius.lg,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  title: {
    marginTop: spacing.lg,
  },
  message: {
    marginTop: spacing.sm - 2,
    maxWidth: 360,
  },
  action: {
    marginTop: spacing.lg,
  },
});
