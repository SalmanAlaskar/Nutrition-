import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Badge, EmptyState, Txt } from '@/components/ui';
import { spacing } from '@/theme';
import type { Insight } from '@/types';

import { InsightCard } from './InsightCard';

export interface InsightListProps {
  /** Already sorted and capped by the engine; rendered in the order given. */
  insights: Insight[];
  /** Heading above the list. */
  title?: string;
  /** One line under the heading. */
  subtitle?: string;
  /** Replaces the default copy shown when there is nothing to list. */
  emptyMessage?: string;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_EMPTY =
  'Log a few days of meals, a session and a body scan, and this list fills in with numbers ' +
  'from your own days.';

/** The heading, the cards, and an honest empty state when nothing fired. */
export function InsightList({
  insights,
  title = 'Insights',
  subtitle,
  emptyMessage,
  style,
}: InsightListProps) {
  return (
    <View style={style}>
      <View style={styles.header}>
        <Txt variant="heading" accessibilityRole="header" style={styles.title}>
          {title}
        </Txt>
        {insights.length > 0 ? <Badge label={String(insights.length)} tone="accent" /> : null}
      </View>

      {subtitle ? (
        <Txt variant="label" color="muted" style={styles.subtitle}>
          {subtitle}
        </Txt>
      ) : null}

      {insights.length === 0 ? (
        <EmptyState
          icon="bulb-outline"
          title="Nothing to flag yet"
          message={emptyMessage ?? DEFAULT_EMPTY}
          style={styles.empty}
        />
      ) : (
        <View style={styles.cards}>
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  title: {
    flexShrink: 1,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  empty: {
    paddingHorizontal: 0,
  },
  cards: {
    marginTop: spacing.md,
    rowGap: spacing.md,
  },
});
