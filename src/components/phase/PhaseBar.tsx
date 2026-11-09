import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Txt } from '@/components/ui';
import { todayKey } from '@/domain/date';
import { formatCount } from '@/domain/format';
import { phaseProgress } from '@/domain/phase';
import { layout, spacing } from '@/theme';
import type { Phase, PhaseKind, Targets } from '@/types';

/**
 * What each kind of phase is called. Shared from here because the bar, the
 * card and both phase screens all name a kind, and they must name it the same
 * way.
 */
export const PHASE_KIND_LABEL_KEYS = {
  cut: 'phases:kindCut',
  maintain: 'phases:kindMaintain',
  build: 'phases:kindBuild',
} as const satisfies Record<PhaseKind, string>;

export interface PhaseBarProps {
  phase: Phase;
  /** The daily target this phase produces, worked out by the screen. */
  targets: Targets;
  /** The day the summary is read on. Defaults to today. */
  today?: string;
  /** Usually opens the phase. Without it the bar is text, not a control. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * One line saying which phase is running: what it is, how long is left of it,
 * and the calorie target it is producing.
 *
 * Deliberately presentational and deliberately quiet. It carries no accent of
 * its own, because it is dropped into screens that already have one, and it
 * takes the phase and its target as props so that no two hosts work the figure
 * out differently.
 */
export function PhaseBar({ phase, targets, today = todayKey(), onPress, style }: PhaseBarProps) {
  const { t } = useTranslation(['phases', 'units']);
  const { daysLeft } = phaseProgress(phase, today);

  const kind = t(PHASE_KIND_LABEL_KEYS[phase.kind]);
  const left =
    daysLeft <= 0
      ? t('phases:daysLeftNone')
      : daysLeft === 1
        ? t('phases:daysLeftOne')
        : t('phases:daysLeftMany', { days: formatCount(daysLeft) });

  // The kind and the span read as one phrase: as two runs Arabic reorders them
  // around the separator.
  const lead = `${kind} · ${left}`;
  const target = `${formatCount(targets.calories)} ${t('units:kcal')}`;
  const spoken = `${kind}. ${left}. ${t('phases:figureSpoken', {
    label: t('phases:targetLabel'),
    value: target,
  })}`;

  const body = (
    <>
      <Txt variant="label" weight="medium" numberOfLines={1} tabular style={styles.lead}>
        {lead}
      </Txt>
      {/* The figure keeps its unit inside the same run, never as a sibling. */}
      <Txt variant="label" weight="semibold" numberOfLines={1} tabular>
        {formatCount(targets.calories)}
        <Txt variant="caption" color="faint" weight="medium">
          {` ${t('units:kcal')}`}
        </Txt>
      </Txt>
    </>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={spoken} style={[styles.row, style]}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={t('phases:cardHint')}
      style={({ pressed }) => [
        styles.row,
        styles.tappable,
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tappable: {
    minHeight: layout.minTarget,
    paddingVertical: spacing.md,
  },
  lead: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
