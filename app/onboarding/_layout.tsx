import { Stack } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { Txt } from '@/components/ui';
import { formatCount } from '@/domain/format';
import { isValidProfileInput } from '@/domain/nutrition';
import { useDirection } from '@/i18n';
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

/** Re-exported so existing imports keep working; the implementation moved. */
export { formatCount };

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
 * Small section label above a group. Latin copy gets the caps-and-tracking
 * treatment; Arabic is cursive, so tracking is removed rather than added.
 */
export function Eyebrow({
  label,
  style,
}: {
  label: string;
  style?: StyleProp<TextStyle>;
}) {
  const { isRTL } = useDirection();

  return (
    <Txt
      variant="caption"
      color="faint"
      weight="semibold"
      numberOfLines={1}
      style={[isRTL ? chrome.eyebrowArabic : chrome.eyebrowLatin, style]}
    >
      {label}
    </Txt>
  );
}

/** Where the person is in the three steps: filled bars plus the count. */
export function StepProgress({ current }: { current: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation('onboarding');

  const label = t('step', {
    current: formatCount(current),
    total: formatCount(ONBOARDING_STEPS),
  });

  return (
    <View accessible accessibilityLabel={label} style={chrome.stepRow}>
      <View style={chrome.stepBars} {...DECORATIVE}>
        {Array.from({ length: ONBOARDING_STEPS }, (_, index) => (
          <View
            key={index}
            style={[
              chrome.stepBar,
              { backgroundColor: index < current ? colors.accent : colors.track },
            ]}
          />
        ))}
      </View>
      <Txt variant="caption" color="faint" weight="medium" numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

const chrome = StyleSheet.create({
  eyebrowLatin: {
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  eyebrowArabic: {
    letterSpacing: 0,
  },
  stepRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    marginBottom: spacing.xl,
  },
  stepBars: {
    columnGap: spacing.xs,
    flex: 1,
    flexDirection: 'row',
  },
  stepBar: {
    borderRadius: radius.pill,
    flex: 1,
    height: spacing.xs,
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
