import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Button, Card, Divider, MacroBar, ProgressRing, Txt } from '@/components/ui';
import { progress } from '@/domain/nutrition';
import { remainingBudget } from '@/domain/totals';
import { radius, spacing, useTheme } from '@/theme';
import type { DailyTotals, Targets } from '@/types';

import { formatCount } from '../../../app/onboarding/_layout';

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
  const consumed = Math.round(totals.macros.calories);

  if (!targets) {
    return (
      <Card style={style}>
        <View style={styles.setup}>
          <View style={[styles.setupGlyph, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="person-outline" size={20} color={colors.accent} {...DECORATIVE} />
          </View>

          <Txt variant="heading" style={styles.setupTitle}>
            No daily target yet
          </Txt>
          <Txt color="muted" style={styles.setupBody}>
            Add your body details and goal, and the app works out your calories and
            macros for every day.
          </Txt>

          <View style={[styles.setupMeta, { backgroundColor: colors.surfaceAlt }]}>
            <Txt variant="label" weight="semibold" tabular>
              {formatCount(consumed)}
            </Txt>
            <Txt variant="label" color="faint">
              kcal logged today
            </Txt>
          </View>

          <Button
            label="Finish profile"
            onPress={onFinishProfile}
            icon="person-outline"
            accessibilityHint="Sets your calorie and macro targets"
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
    ? `${formatCount(Math.abs(budget.calories))} kcal over target`
    : `${formatCount(budget.calories)} kcal left today`;

  return (
    <Card style={style}>
      <View
        accessible
        accessibilityLabel={`${formatCount(consumed)} of ${formatCount(targets.calories)} calories. ${remainingText}.`}
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
            {`of ${formatCount(targets.calories)} kcal`}
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
          label="Protein"
          value={totals.macros.protein}
          target={targets.protein}
          color={colors.protein}
        />
        <MacroBar
          label="Carbs"
          value={totals.macros.carbs}
          target={targets.carbs}
          color={colors.carbs}
        />
        <MacroBar
          label="Fat"
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
