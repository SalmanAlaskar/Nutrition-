import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Button, Card, Txt } from '@/components/ui';
import { radius, spacing, useTheme, type Palette } from '@/theme';
import type { Insight } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Decoration only: the text beside it already carries the meaning. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

/** One palette slot per tone, used for the edge bar and the glyph. */
const TONE_COLOR: Record<Insight['tone'], keyof Palette> = {
  positive: 'success',
  neutral: 'accent',
  warning: 'warning',
};

export interface InsightCardProps {
  insight: Insight;
  style?: StyleProp<ViewStyle>;
}

/**
 * One observation: a tone-coloured edge, its glyph, the headline, the numbers
 * behind it and, when the insight offers one, a button that opens the screen
 * where it can be acted on.
 */
export function InsightCard({ insight, style }: InsightCardProps) {
  const { colors } = useTheme();
  const router = useRouter();

  const { actionHref, actionLabel } = insight;
  const accent = colors[TONE_COLOR[insight.tone]];

  const handleAction = useCallback(() => {
    if (actionHref) router.push(actionHref);
  }, [router, actionHref]);

  return (
    <Card padded={false} style={style}>
      <View style={styles.row}>
        <View style={[styles.edge, { backgroundColor: accent }]} {...DECORATIVE} />

        <View style={styles.body}>
          <View accessible accessibilityLabel={`${insight.title}. ${insight.detail}`}>
            <View style={styles.header}>
              <View
                style={[styles.glyph, { backgroundColor: colors.surfaceAlt }]}
                {...DECORATIVE}
              >
                <Ionicons name={insight.icon as IconName} size={18} color={accent} />
              </View>
              <Txt variant="body" weight="semibold" style={styles.title}>
                {insight.title}
              </Txt>
            </View>

            <Txt variant="label" color="muted" style={styles.detail}>
              {insight.detail}
            </Txt>
          </View>

          {actionHref && actionLabel ? (
            <Button
              label={actionLabel}
              onPress={handleAction}
              variant="secondary"
              size="sm"
              iconRight="arrow-forward"
              style={styles.action}
            />
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  edge: {
    width: 4,
  },
  body: {
    flex: 1,
    padding: spacing.lg,
  },
  header: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  glyph: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  title: {
    flex: 1,
  },
  detail: {
    marginTop: spacing.sm,
  },
  action: {
    marginTop: spacing.md,
  },
});
