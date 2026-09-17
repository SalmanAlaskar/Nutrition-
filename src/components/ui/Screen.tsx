import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, useTheme } from '@/theme';

export type ScreenEdge = 'top' | 'bottom';

export interface ScreenProps {
  children?: React.ReactNode;
  scroll?: boolean;
  /** Horizontal gutter around the content. On by default. */
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Which safe-area insets to honour. Defaults to the top edge only. */
  edges?: ScreenEdge[];
  keyboardAvoiding?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

const DEFAULT_EDGES: ScreenEdge[] = ['top'];

const KEYBOARD_DISMISS_MODE =
  Platform.OS === 'ios' ? 'interactive' : Platform.OS === 'android' ? 'on-drag' : 'none';

export function Screen({
  children,
  scroll = false,
  padded = true,
  refreshing = false,
  onRefresh,
  edges = DEFAULT_EDGES,
  keyboardAvoiding = false,
  style,
  contentStyle,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const top = edges.includes('top') ? insets.top : 0;
  const bottom = edges.includes('bottom') ? insets.bottom : 0;
  const gutter = padded ? spacing.lg : 0;

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingHorizontal: gutter, paddingBottom: bottom + (padded ? spacing.xl : 0) },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      // Never dismiss on drag on the web. Opening the on-screen keyboard there
      // shrinks the viewport and the browser scrolls the focused field into
      // view; 'on-drag' reads that as a drag and closes the keyboard again, so
      // every digit needs a fresh tap.
      keyboardDismissMode={KEYBOARD_DISMISS_MODE}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, { paddingHorizontal: gutter, paddingBottom: bottom }, contentStyle]}>
      {children}
    </View>
  );

  const inner = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg, paddingTop: top }, style]}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
