import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Button, MacroBar, ProgressRing, Txt } from '@/components/ui';
import { formatCount } from '@/domain/format';
import { progress } from '@/domain/nutrition';
import { remainingBudget } from '@/domain/totals';
import { layout, radius, spacing, useTheme } from '@/theme';
import type { DailyTotals, Targets } from '@/types';

export interface CalorieSummaryProps {
  totals: DailyTotals;
  /** Null until the profile exists; the summary then prompts for setup. */
  targets: Targets | null;
  onFinishProfile: () => void;
  /** Tapping the ring opens the longer view of the same number. */
  onOpenHistory: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * The ring is the one thing on this screen allowed to be large, and the one
 * thing allowed to carry the accent. Thin stroke, nothing drawn around it: the
 * page is its container.
 */
const RING_SIZE = 212;
const RING_STROKE = 10;

export function CalorieSummary({
  totals,
  targets,
  onFinishProfile,
  onOpenHistory,
  style,
}: CalorieSummaryProps) {
  const { colors } = useTheme();
  const { t } = useTranslation(['today', 'macros', 'units']);
  const consumed = Math.round(totals.macros.calories);

  if (!targets) {
    return (
      <View style={style}>
        <Txt variant="heading">{t('today:noTargetTitle')}</Txt>
        <Txt color="muted" style={styles.setupBody}>
          {t('today:noTargetBody')}
        </Txt>

        {/*
          Figure and unit in one text run. As siblings Arabic reorders them and
          the count ends up glued to whatever follows it.
        */}
        <Txt variant="metric" tabular numberOfLines={1} style={styles.setupFigure}>
          {formatCount(consumed)}
          <Txt variant="label" color="faint" weight="medium">
            {` ${t('today:noTargetLogged')}`}
          </Txt>
        </Txt>

        <Button
          label={t('today:finishProfile')}
          onPress={onFinishProfile}
          accessibilityHint={t('today:finishProfileHint')}
          style={styles.setupAction}
        />
      </View>
    );
  }

  const budget = remainingBudget(totals.macros, targets);
  const over = budget.overTarget;
  // Past the target the arc warns rather than alarms: this is an estimate of a
  // day's eating, not a fault.
  const stateColor = over ? colors.warning : colors.accent;
  const remainingText = over
    ? t('today:caloriesOver', { value: formatCount(Math.abs(budget.calories)) })
    : t('today:caloriesLeft', { value: formatCount(budget.calories) });

  return (
    <View style={style}>
      <Pressable
        onPress={onOpenHistory}
        accessibilityRole="button"
        accessibilityLabel={t('today:ringSpoken', {
          eaten: formatCount(consumed),
          target: formatCount(targets.calories),
          state: remainingText,
        })}
        accessibilityHint={t('today:hintHistory')}
        style={({ pressed }) => [styles.hero, pressed ? styles.pressed : null]}
      >
        <ProgressRing
          size={RING_SIZE}
          strokeWidth={RING_STROKE}
          progress={progress(totals.macros.calories, targets.calories)}
          color={stateColor}
        >
          <Txt variant="display" tabular numberOfLines={1}>
            {formatCount(consumed)}
          </Txt>
          <Txt
            variant="label"
            color="muted"
            tabular
            numberOfLines={1}
            style={styles.ringTarget}
          >
            {t('today:ringTarget', { target: formatCount(targets.calories) })}
          </Txt>
        </ProgressRing>

        {/*
          One line of words: no pill, no dot and no accent. The arc is already
          the one accent on this screen, and a day past its target is told in a
          muted amber rather than shouted in red.
        */}
        <Txt
          variant="label"
          color={over ? 'warning' : 'muted'}
          align="center"
          tabular
          numberOfLines={1}
          style={styles.remaining}
        >
          {remainingText}
        </Txt>
      </Pressable>

      <View style={styles.macros}>
        <MacroBar
          label={t('macros:protein')}
          value={totals.macros.protein}
          target={targets.protein}
          color={colors.protein}
        />
        <MacroBar
          label={t('macros:carbs')}
          value={totals.macros.carbs}
          target={targets.carbs}
          color={colors.carbs}
        />
        <MacroBar
          label={t('macros:fat')}
          value={totals.macros.fat}
          target={targets.fat}
          color={colors.fat}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    borderRadius: radius.xl,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  ringTarget: {
    marginTop: spacing.sm,
  },
  remaining: {
    marginTop: spacing.lg,
  },
  // The bars sit well clear of the ring so they read as its footnote, not as a
  // second block competing with it.
  macros: {
    marginTop: spacing.xxl,
    rowGap: spacing.lg,
  },
  setupBody: {
    marginTop: spacing.sm,
    maxWidth: layout.maxTextWidth,
  },
  setupFigure: {
    marginTop: spacing.xl,
  },
  setupAction: {
    marginTop: spacing.xl,
  },
});
