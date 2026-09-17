import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Badge, EmptyState, Txt } from '@/components/ui';
import { formatCount } from '@/domain/format';
import type { Insight } from '@/domain/insights';
import { spacing } from '@/theme';

import { InsightCard } from './InsightCard';

export interface InsightListProps {
  /** Already sorted and capped by the engine; rendered in the order given. */
  insights: Insight[];
  /** Heading above the list. Defaults to the translated section name. */
  title?: string;
  /** One line under the heading. */
  subtitle?: string;
  /** Replaces the default copy shown when there is nothing to list. */
  emptyMessage?: string;
  style?: StyleProp<ViewStyle>;
}

/** The heading, the cards, and an honest empty state when nothing fired. */
export function InsightList({ insights, title, subtitle, emptyMessage, style }: InsightListProps) {
  const { t } = useTranslation('insights');

  return (
    <View style={style}>
      <View style={styles.header}>
        <Txt variant="heading" accessibilityRole="header" style={styles.title}>
          {title ?? t('listTitle')}
        </Txt>
        {insights.length > 0 ? (
          <Badge label={formatCount(insights.length)} tone="accent" />
        ) : null}
      </View>

      {subtitle ? (
        <Txt variant="label" color="muted" style={styles.subtitle}>
          {subtitle}
        </Txt>
      ) : null}

      {insights.length === 0 ? (
        <EmptyState
          icon="bulb-outline"
          title={t('emptyTitle')}
          message={emptyMessage ?? t('emptyMessage')}
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
