import React from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';

import { IconButton } from './IconButton';
import { Txt } from './Txt';

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /** Shows a back chevron when provided. */
  onBack?: () => void;
  /** Trailing node, usually an IconButton. */
  right?: React.ReactNode;
  /** Renders the title below the bar at display scale. */
  large?: boolean;
}

export function AppHeader({ title, subtitle, onBack, right, large = false }: AppHeaderProps) {
  const back = onBack ? (
    <IconButton
      icon="chevron-back"
      onPress={onBack}
      accessibilityLabel="Go back"
      style={styles.back}
    />
  ) : null;

  if (large) {
    return (
      <View style={styles.wrapper}>
        {back || right ? (
          <View style={styles.bar}>
            <View style={styles.side}>{back}</View>
            <View style={[styles.side, styles.sideEnd]}>{right}</View>
          </View>
        ) : null}
        <View style={styles.largeText} accessibilityRole="header">
          <Txt variant="title" numberOfLines={2}>
            {title}
          </Txt>
          {subtitle ? (
            <Txt variant="label" color="muted" style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, styles.bar]}>
      {back}
      <View style={[styles.inlineText, onBack ? styles.inlineTextWithBack : null]}>
        <Txt variant="heading" numberOfLines={1} accessibilityRole="header">
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="caption" color="muted" numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  bar: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    minHeight: 48,
  },
  side: {
    flexDirection: 'row',
    minHeight: 44,
    alignItems: 'center',
  },
  sideEnd: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  back: {
    marginStart: -spacing.md,
  },
  inlineText: {
    flex: 1,
    justifyContent: 'center',
  },
  inlineTextWithBack: {
    marginStart: -spacing.xs,
  },
  largeText: {
    marginTop: spacing.xs,
  },
  subtitle: {
    marginTop: 2,
  },
});
