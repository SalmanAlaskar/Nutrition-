import { Stack } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View, type AccessibilityProps } from 'react-native';

import { Txt } from '@/components/ui';
import { formatCount } from '@/domain/format';
import { isValidProfileInput } from '@/domain/nutrition';
import { radius, spacing, useTheme } from '@/theme';
import type { ActivityLevel, Goal, Sex, UnitSystem } from '@/types';

/**
 * The draft travels between the onboarding steps as URL params, so a back
 * navigation — or a cold reload of a deep link — never loses what was typed.
 * The codec lives next to the Stack that owns the three steps.
 */

/** Body facts collected on step one, already in canonical units. */
export interface BodyDraft {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  units: UnitSystem;
}

/** Everything the plan screen needs to compute targets. */
export interface PlanDraft extends BodyDraft {
  activityLevel: ActivityLevel;
  goal: Goal;
}

/** Shape of `useLocalSearchParams()` output: values arrive as strings. */
export type OnboardingParams = Record<string, string | string[] | undefined>;

const SEXES: Sex[] = ['male', 'female'];
const UNIT_SYSTEMS: UnitSystem[] = ['metric', 'imperial'];
const ACTIVITY_LEVELS: ActivityLevel[] = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
];
const GOALS: Goal[] = ['lose', 'maintain', 'gain'];

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(
  value: string | string[] | undefined,
  allowed: T[],
): T | undefined {
  const raw = single(value);
  return allowed.find((candidate) => candidate === raw);
}

function numeric(value: string | string[] | undefined): number | null {
  const raw = single(value);
  if (raw === undefined || raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Returns null when anything is missing or outside the accepted limits. */
export function parseBodyDraft(params: OnboardingParams): BodyDraft | null {
  const sex = oneOf(params.sex, SEXES);
  const units = oneOf(params.units, UNIT_SYSTEMS);
  const age = numeric(params.age);
  const heightCm = numeric(params.heightCm);
  const weightKg = numeric(params.weightKg);

  if (!sex || !units || age === null || heightCm === null || weightKg === null) {
    return null;
  }
  if (!isValidProfileInput({ age, heightCm, weightKg })) return null;

  return { sex, age, heightCm, weightKg, units };
}

export function parsePlanDraft(params: OnboardingParams): PlanDraft | null {
  const body = parseBodyDraft(params);
  const activityLevel = oneOf(params.activityLevel, ACTIVITY_LEVELS);
  const goal = oneOf(params.goal, GOALS);

  if (!body || !activityLevel || !goal) return null;
  return { ...body, activityLevel, goal };
}

export function bodyDraftParams(draft: BodyDraft): Record<string, string> {
  return {
    sex: draft.sex,
    units: draft.units,
    age: String(draft.age),
    heightCm: String(draft.heightCm),
    weightKg: String(draft.weightKg),
  };
}

export function planDraftParams(draft: PlanDraft): Record<string, string> {
  return {
    ...bodyDraftParams(draft),
    activityLevel: draft.activityLevel,
    goal: draft.goal,
  };
}

/* ------------------------------------------------------------- chrome -- */

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

/** Steps after the welcome screen: body, goals, plan. */
export const ONBOARDING_STEPS = 3;

/**
 * Where the person is in the three steps. It sits above the title as a quiet
 * line of type: the step count is orientation, never the point of the screen,
 * so the bars are neutral and the accent is left for the button below.
 */
export function StepProgress({ current }: { current: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation('onboarding');

  const label = t('step', {
    current: formatCount(current),
    total: formatCount(ONBOARDING_STEPS),
  });

  return (
    <View accessible accessibilityLabel={label} style={chrome.stepRow}>
      <Txt variant="caption" color="faint" weight="medium" numberOfLines={1}>
        {label}
      </Txt>
      <View style={chrome.stepBars} {...DECORATIVE}>
        {Array.from({ length: ONBOARDING_STEPS }, (_, index) => (
          <View
            key={index}
            style={[
              chrome.stepBar,
              { backgroundColor: index < current ? colors.textMuted : colors.track },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const chrome = StyleSheet.create({
  stepRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    paddingTop: spacing.sm,
  },
  stepBars: {
    columnGap: spacing.xs,
    flex: 1,
    flexDirection: 'row',
    maxWidth: 120,
  },
  stepBar: {
    borderRadius: radius.pill,
    flex: 1,
    height: 2,
  },
});

export default function OnboardingLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="body" />
      <Stack.Screen name="goals" />
      <Stack.Screen name="plan" />
    </Stack>
  );
}
