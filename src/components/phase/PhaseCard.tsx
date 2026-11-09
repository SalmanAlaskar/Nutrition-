import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useDayText } from '@/components/history/dayText';
import { Txt } from '@/components/ui';
import { daysBetween, todayKey } from '@/domain/date';
import { formatCount } from '@/domain/format';
import { phaseLengthDays, phaseProgress } from '@/domain/phase';
import { radius, spacing, useTheme } from '@/theme';
import type { Phase, Targets } from '@/types';

import { PHASE_KIND_LABEL_KEYS } from './PhaseBar';

/** Where a phase sits relative to the day it is being read on. */
export type PhaseStatus = 'running' | 'planned' | 'finished';

export function phaseStatus(phase: Phase, today: string): PhaseStatus {
  if (phase.startDate > today) return 'planned';
  if (phase.endDate < today) return 'finished';
  return 'running';
}

const STATUS_KEYS = {
  running: 'phases:statusRunning',
  planned: 'phases:statusPlanned',
  finished: 'phases:statusFinished',
} as const satisfies Record<PhaseStatus, string>;

export interface PhaseCardProps {
  phase: Phase;
  /** The daily target this phase produces, worked out by the screen. */
  targets: Targets;
  /** The day the card is read on. Defaults to today. */
  today?: string;
  /** Opens the phase in the editor. */
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * One phase as a row of text: what it is and the calorie target it carries,
 * then the days it covers, then where it stands. Nothing is drawn around it —
 * the space between rows does the grouping, as everywhere else in the app.
 */
export function PhaseCard({ phase, targets, today = todayKey(), onPress, style }: PhaseCardProps) {
  const { t } = useTranslation(['phases', 'units']);
  const { colors } = useTheme();
  const { shortDay } = useDayText();

  const status = phaseStatus(phase, today);
  const kind = t(PHASE_KIND_LABEL_KEYS[phase.kind]);
  const dates = t('phases:dateRange', {
    from: shortDay(phase.startDate),
    to: shortDay(phase.endDate),
  });
  const length = t('phases:lengthDays', { days: formatCount(phaseLengthDays(phase)) });
  const target = `${formatCount(targets.calories)} ${t('units:kcal')}`;

  /**
   * Where the phase stands, in one phrase. Each key is named on its own line so
   * i18next can check the interpolations it is given.
   */
  const standing = (): string => {
    if (status === 'planned') {
      const until = daysBetween(today, phase.startDate);
      return until <= 1
        ? t('phases:startsTomorrow')
        : t('phases:startsInDays', { days: formatCount(until) });
    }
    if (status === 'finished') {
      const since = daysBetween(phase.endDate, today);
      return since <= 1
        ? t('phases:endedYesterday')
        : t('phases:endedDaysAgo', { days: formatCount(since) });
    }
    const { dayNumber, totalDays, daysLeft } = phaseProgress(phase, today);
    const left =
      daysLeft <= 0
        ? t('phases:daysLeftNone')
        : daysLeft === 1
          ? t('phases:daysLeftOne')
          : t('phases:daysLeftMany', { days: formatCount(daysLeft) });
    return `${t('phases:dayOfTotal', {
      day: formatCount(dayNumber),
      total: formatCount(totalDays),
    })} · ${left}`;
  };

  const foot = status === 'running' ? standing() : `${standing()} · ${length}`;

  const spoken = t('phases:cardSpoken', {
    kind,
    status: t(STATUS_KEYS[status]),
    dates,
    figures: [
      t('phases:figureSpoken', { label: t('phases:targetLabel'), value: target }),
      foot,
    ].join(t('phases:listSeparator')),
  });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={t('phases:cardHint')}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.surfaceAlt } : null,
        style,
      ]}
    >
      <View style={styles.head}>
        <Txt numberOfLines={1} style={styles.title}>
          {kind}
        </Txt>
        {/* The figure keeps its unit inside the same run, never as a sibling. */}
        <Txt variant="label" weight="semibold" tabular numberOfLines={1}>
          {formatCount(targets.calories)}
          <Txt variant="caption" color="faint" weight="medium">
            {` ${t('units:kcal')}`}
          </Txt>
        </Txt>
      </View>

      <Txt variant="label" color="muted" numberOfLines={1} tabular>
        {dates}
      </Txt>
      <Txt variant="caption" color="faint" numberOfLines={1} tabular>
        {foot}
      </Txt>
      {phase.note ? (
        <Txt variant="caption" color="faint" numberOfLines={1}>
          {phase.note}
        </Txt>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 64,
    paddingVertical: spacing.md,
    rowGap: 2,
  },
  head: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    flexShrink: 1,
  },
});
