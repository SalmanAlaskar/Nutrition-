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
  /** Defaults to the translated "Nothing here yet". */
  title?: string;
  /** Defaults to a translated line explaining that the space fills in later. */
  message?: string;
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
  const { t } = useTranslation('common');

  return (
    <View style={[styles.wrapper, style]}>
      <View style={[styles.mark, { backgroundColor: colors.accentSoft }]} {...DECORATIVE}>
        <Ionicons name={icon as IconName} size={24} color={colors.accent} />
      </View>

      <Txt variant="heading" weight="bold" style={styles.title}>
        {title ?? t('emptyTitle')}
      </Txt>
      <Txt color="muted" style={styles.message}>
        {message ?? t('emptyMessage')}
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
