import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { layout, spacing, useTheme } from '@/theme';

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
  /** Ionicons glyph, drawn quietly above the title. */
  icon: string;
  /** Defaults to the translated "Nothing here yet". */
  title?: string;
  /** Defaults to a translated line explaining that the space fills in later. */
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Tighter padding, for an empty slot sitting inside a longer screen. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
  style,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const { t } = useTranslation('common');

  return (
    <View style={[styles.wrapper, compact ? styles.compact : null, style]}>
      {/* No accent halo: an empty slot is not the most important thing on the screen. */}
      <View {...DECORATIVE}>
        <Ionicons name={icon as IconName} size={compact ? 20 : 24} color={colors.textFaint} />
      </View>

      <Txt variant={compact ? 'body' : 'heading'} style={styles.title}>
        {title ?? t('emptyTitle')}
      </Txt>
      <Txt variant="label" color="muted" style={styles.message}>
        {message ?? t('emptyMessage')}
      </Txt>

      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          size="sm"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'flex-start',
    paddingVertical: spacing.xl,
  },
  compact: {
    paddingVertical: spacing.lg,
  },
  title: {
    marginTop: spacing.md,
  },
  message: {
    marginTop: spacing.xs,
    maxWidth: layout.maxTextWidth,
  },
  action: {
    marginTop: spacing.lg,
  },
});
