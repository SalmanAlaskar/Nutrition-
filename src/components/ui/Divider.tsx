import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { spacing, useTheme } from '@/theme';

export interface DividerProps {
  /** Indents the line so it lines up with row content instead of the card edge. */
  inset?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Divider({ inset, style }: DividerProps) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="none"
      style={[
        styles.line,
        { backgroundColor: colors.border },
        inset ? styles.inset : null,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  inset: {
    marginLeft: spacing.lg,
    width: 'auto',
  },
});
