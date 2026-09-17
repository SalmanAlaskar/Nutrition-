import React from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { Txt } from './Txt';

export interface LoadingViewProps {
  message?: string;
  style?: StyleProp<ViewStyle>;
}

export function LoadingView({ message = 'Loading', style }: LoadingViewProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.wrapper, style]} accessibilityRole="progressbar" accessible>
      <View style={[styles.disc, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
      <Txt variant="label" color="muted" align="center" style={styles.message}>
        {message}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  disc: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  message: {
    marginTop: spacing.md,
  },
});
