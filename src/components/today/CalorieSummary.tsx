import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Button, Card, Divider, MacroBar, ProgressRing, Txt } from '@/components/ui';
import { formatCount } from '@/domain/format';
import { progress } from '@/domain/nutrition';
import { remainingBudget } from '@/domain/totals';
import { radius, spacing, useTheme } from '@/theme';
import type { DailyTotals, Targets } from '@/types';

export interface CalorieSummaryProps {
  totals: DailyTotals;
  /** Null until the profile exists; the card then prompts for setup. */
  targets: Targets | null;
  onFinishProfile: () => void;
  style?: StyleProp<ViewStyle>;
}

const RING_SIZE = 200;
const RING_STROKE = 18;

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

export function CalorieSummary({
  totals,
  targets,
  onFinishProfile,
  style,
}: CalorieSummaryProps) {
  const { colors } = useTheme();
  const { t } = useTranslation(['today', 'macros', 'units']);
  const consumed = Math.round(totals.macros.calories);

  if (!targets) {
    return (
      <Card style={style}>
        <View style={styles.setup}>
          <View style={[styles.setupGlyph, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="person-outline" size={20} color={colors.accent} {...DECORATIVE} />
          </View>

          <Txt variant="heading" style={styles.setupTitle}>
            {t('today:noTargetTitle')}
          </Txt>
          <Txt color="muted" style={styles.setupBody}>
            {t('today:noTargetBody')}
          </Txt>

          <View style={[styles.setupMeta, { backgroundColor: colors.surfaceAlt }]}>
            <Txt variant="label" weight="semibold" tabular>
              {formatCount(consumed)}
            </Txt>
            <Txt variant="label" color="faint">
              {t('today:noTargetLogged')}
            </Txt>
          </View>

          <Button
            label={t('today:finishProfile')}
            onPress={onFinishProfile}
            icon="person-outline"
            accessibilityHint={t('today:finishProfileHint')}
            style={styles.setupAction}
          />
        </View>
      </Card>
    );
  }

  const budget = remainingBudget(totals.macros, targets);
  const over = budget.overTarget;
  const stateColor = over ? colors.danger : colors.accent;
  const remainingText = over
    ? t('today:caloriesOver', { value: formatCount(Math.abs(budget.calories)) })
    : t('today:caloriesLeft', { value: formatCount(budget.calories) });

  return (
    <Card style={style}>
      <View
        accessible
        accessibilityLabel={t('today:ringSpoken', {
          eaten: formatCount(consumed),
          target: formatCount(targets.calories),
          state: remainingText,
        })}
        style={styles.hero}
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
          <Txt variant="label" color="muted" tabular style={styles.ringTarget}>
            {t('today:ringTarget', { target: formatCount(targets.calories) })}
          </Txt>
        </ProgressRing>

        <View style={[styles.remaining, { backgroundColor: colors.surfaceAlt }]}>
          <View style={[styles.dot, { backgroundColor: stateColor }]} {...DECORATIVE} />
          <Txt
            variant="label"
            weight="semibold"
            color={over ? 'danger' : 'accent'}
            tabular
            numberOfLines={1}
          >
            {remainingText}
          </Txt>
        </View>
      </View>

      <Divider style={styles.split} />

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
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  ringTarget: {
    marginTop: spacing.xs,
  },
  remaining: {
    alignItems: 'center',
    borderRadius: radius.pill,
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm - 1,
  },
  dot: {
    borderRadius: radius.pill,
    height: 7,
    width: 7,
  },
  split: {
    marginTop: spacing.xl,
  },
  macros: {
    marginTop: spacing.lg,
    rowGap: spacing.lg,
  },
  setup: {
    alignItems: 'flex-start',
  },
  setupGlyph: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  setupTitle: {
    marginTop: spacing.md,
  },
  setupBody: {
    marginTop: spacing.sm,
  },
  setupMeta: {
    alignItems: 'baseline',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    columnGap: spacing.xs + 2,
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
  },
  setupAction: {
    marginTop: spacing.lg,
  },
});
