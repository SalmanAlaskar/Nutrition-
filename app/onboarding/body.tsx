import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppHeader,
  Button,
  NumberField,
  Screen,
  SegmentedControl,
  Txt,
  type SegmentedOption,
} from '@/components/ui';
import {
  LIMITS,
  cmToFeetInches,
  feetInchesToCm,
  isValidProfileInput,
  kgToLb,
  lbToKg,
} from '@/domain/nutrition';
import { spacing } from '@/theme';
import type { Sex, UnitSystem } from '@/types';

import { bodyDraftParams, parseBodyDraft, type BodyDraft } from './_layout';

const UNIT_OPTIONS: SegmentedOption<UnitSystem>[] = [
  { value: 'metric', label: 'cm / kg' },
  { value: 'imperial', label: 'ft / lb' },
];

const SEX_OPTIONS: SegmentedOption<Sex>[] = [
  { value: 'male', label: 'Male', icon: 'male' },
  { value: 'female', label: 'Female', icon: 'female' },
];

const INCHES_PER_FOOT = 12;
const CM_PER_INCH = 2.54;

/** Imperial bounds are pulled inwards so a shown bound is always accepted. */
const MIN_TOTAL_INCHES = Math.ceil(LIMITS.heightCm.min / CM_PER_INCH);
const MAX_TOTAL_INCHES = Math.floor(LIMITS.heightCm.max / CM_PER_INCH);
const MIN_LB = Math.ceil(kgToLb(LIMITS.weightKg.min));
const MAX_LB = Math.floor(kgToLb(LIMITS.weightKg.max));

function formatFeetInches(totalInches: number): string {
  return `${Math.floor(totalInches / INCHES_PER_FOOT)} ft ${totalInches % INCHES_PER_FOOT} in`;
}

export default function BodyStep() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Re-entering this step (a bounce back from a later screen) restores the draft.
  const [initial] = useState(() => parseBodyDraft(params));
  const initialFeetInches = initial ? cmToFeetInches(initial.heightCm) : null;

  const [units, setUnits] = useState<UnitSystem>(initial?.units ?? 'metric');
  const [sex, setSex] = useState<Sex>(initial?.sex ?? 'male');
  const [age, setAge] = useState<number | null>(initial?.age ?? null);
  const [heightCm, setHeightCm] = useState<number | null>(initial?.heightCm ?? null);
  const [feet, setFeet] = useState<number | null>(initialFeetInches?.feet ?? null);
  const [inches, setInches] = useState<number | null>(initialFeetInches?.inches ?? null);
  const [weightKg, setWeightKg] = useState<number | null>(initial?.weightKg ?? null);
  const [weightLb, setWeightLb] = useState<number | null>(
    initial ? kgToLb(initial.weightKg) : null,
  );

  const metric = units === 'metric';

  /** Switching units converts what is already typed instead of discarding it. */
  const switchUnits = (next: UnitSystem) => {
    if (next === units) return;

    if (next === 'imperial') {
      if (heightCm !== null) {
        const converted = cmToFeetInches(heightCm);
        setFeet(converted.feet);
        setInches(converted.inches);
      }
      if (weightKg !== null) setWeightLb(kgToLb(weightKg));
    } else {
      if (feet !== null || inches !== null) {
        setHeightCm(feetInchesToCm(feet ?? 0, inches ?? 0));
      }
      if (weightLb !== null) setWeightKg(lbToKg(weightLb));
    }

    setUnits(next);
  };

  const heightValue = metric
    ? heightCm
    : feet === null && inches === null
      ? null
      : feetInchesToCm(feet ?? 0, inches ?? 0);

  const weightValue = metric ? weightKg : weightLb === null ? null : lbToKg(weightLb);

  const ageError =
    age !== null && (age < LIMITS.age.min || age > LIMITS.age.max)
      ? `Age must be between ${LIMITS.age.min} and ${LIMITS.age.max}`
      : undefined;

  const inchesError =
    !metric && inches !== null && (inches < 0 || inches >= INCHES_PER_FOOT)
      ? 'Use 0 to 11 inches'
      : undefined;

  const heightOutOfRange =
    heightValue !== null &&
    (heightValue < LIMITS.heightCm.min || heightValue > LIMITS.heightCm.max);

  const heightError = heightOutOfRange
    ? metric
      ? `Height must be between ${LIMITS.heightCm.min} and ${LIMITS.heightCm.max} cm`
      : `Height must be between ${formatFeetInches(MIN_TOTAL_INCHES)} and ${formatFeetInches(MAX_TOTAL_INCHES)}`
    : undefined;

  const heightHelp = inchesError ?? heightError;

  const weightOutOfRange =
    weightValue !== null &&
    (weightValue < LIMITS.weightKg.min || weightValue > LIMITS.weightKg.max);

  const weightError = weightOutOfRange
    ? metric
      ? `Weight must be between ${LIMITS.weightKg.min} and ${LIMITS.weightKg.max} kg`
      : `Weight must be between ${MIN_LB} and ${MAX_LB} lb`
    : undefined;

  const draft = useMemo<BodyDraft | null>(() => {
    if (age === null || heightValue === null || weightValue === null) return null;
    if (inchesError) return null;
    if (!isValidProfileInput({ age, heightCm: heightValue, weightKg: weightValue })) {
      return null;
    }
    return { sex, age, heightCm: heightValue, weightKg: weightValue, units };
  }, [sex, age, heightValue, weightValue, units, inchesError]);

  const handleContinue = () => {
    if (!draft) return;
    router.push({ pathname: '/onboarding/goals', params: bodyDraftParams(draft) });
  };

  return (
    <Screen scroll keyboardAvoiding edges={['top', 'bottom']}>
      <AppHeader
        large
        title="About you"
        subtitle="Step 1 of 3 — the numbers behind your target"
        onBack={() => router.back()}
      />

      <SegmentedControl
        options={UNIT_OPTIONS}
        value={units}
        onChange={switchUnits}
        style={styles.units}
      />

      <View style={styles.fields}>
        <View>
          <Txt variant="label" color="muted" weight="medium" style={styles.label}>
            Sex
          </Txt>
          <SegmentedControl options={SEX_OPTIONS} value={sex} onChange={setSex} />
          <Txt variant="caption" color="faint" style={styles.caption}>
            Used only to pick the constant in the metabolic-rate formula, which
            differs by about 166 calories a day.
          </Txt>
        </View>

        <NumberField
          label="Age"
          value={age}
          onChange={setAge}
          suffix="years"
          placeholder="30"
          hint={`${LIMITS.age.min} to ${LIMITS.age.max}`}
          error={ageError}
        />

        {metric ? (
          <NumberField
            label="Height"
            value={heightCm}
            onChange={setHeightCm}
            suffix="cm"
            placeholder="175"
            hint={`${LIMITS.heightCm.min} to ${LIMITS.heightCm.max} cm`}
            error={heightError}
          />
        ) : (
          <View>
            <Txt variant="label" color="muted" weight="medium" style={styles.label}>
              Height
            </Txt>
            <View style={styles.row}>
              <NumberField
                label="Feet"
                value={feet}
                onChange={setFeet}
                suffix="ft"
                placeholder="5"
                style={styles.rowItem}
              />
              <NumberField
                label="Inches"
                value={inches}
                onChange={setInches}
                suffix="in"
                placeholder="9"
                style={styles.rowItem}
              />
            </View>
            <Txt
              variant="caption"
              color={heightHelp ? 'danger' : 'faint'}
              style={styles.caption}
            >
              {heightHelp ??
                `${formatFeetInches(MIN_TOTAL_INCHES)} to ${formatFeetInches(MAX_TOTAL_INCHES)}`}
            </Txt>
          </View>
        )}

        {metric ? (
          <NumberField
            label="Weight"
            value={weightKg}
            onChange={setWeightKg}
            suffix="kg"
            placeholder="75"
            hint={`${LIMITS.weightKg.min} to ${LIMITS.weightKg.max} kg`}
            error={weightError}
          />
        ) : (
          <NumberField
            label="Weight"
            value={weightLb}
            onChange={setWeightLb}
            suffix="lb"
            placeholder="165"
            hint={`${MIN_LB} to ${MAX_LB} lb`}
            error={weightError}
          />
        )}
      </View>

      <View style={styles.spacer} />

      <Button
        label="Continue"
        iconRight="arrow-forward"
        size="lg"
        fullWidth
        disabled={!draft}
        onPress={handleContinue}
        accessibilityHint="Goes to activity level and goal"
        style={styles.continue}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  units: {
    marginBottom: spacing.xl,
  },
  fields: {
    rowGap: spacing.lg,
  },
  label: {
    marginBottom: spacing.xs + 2,
  },
  caption: {
    marginLeft: spacing.xs,
    marginTop: spacing.xs + 2,
  },
  row: {
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  rowItem: {
    flex: 1,
  },
  spacer: {
    flexGrow: 1,
    minHeight: spacing.xl,
  },
  continue: {
    marginTop: spacing.xl,
  },
});
