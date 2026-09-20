import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  AppHeader,
  Button,
  MeasurePicker,
  Screen,
  SegmentedControl,
  Txt,
  type SegmentedOption,
} from '@/components/ui';
import { formatCount } from '@/domain/format';
import {
  LIMITS,
  cmToFeetInches,
  feetInchesToCm,
  isValidProfileInput,
  kgToLb,
  lbToKg,
} from '@/domain/nutrition';
import { mirrorIcon, useDirection } from '@/i18n';
import { spacing } from '@/theme';
import type { Sex, UnitSystem } from '@/types';

import { StepProgress, bodyDraftParams, parseBodyDraft, type BodyDraft } from './_layout';

const INCHES_PER_FOOT = 12;
const CM_PER_INCH = 2.54;

/**
 * The whole difference the answer makes: Mifflin-St Jeor adds 5 for men and
 * subtracts 161 for women, and nothing else in the formula changes.
 */
const SEX_CALORIE_GAP = 166;

/** Imperial bounds are pulled inwards so a shown bound is always accepted. */
const MIN_TOTAL_INCHES = Math.ceil(LIMITS.heightCm.min / CM_PER_INCH);
const MAX_TOTAL_INCHES = Math.floor(LIMITS.heightCm.max / CM_PER_INCH);
const MIN_FEET = Math.floor(MIN_TOTAL_INCHES / INCHES_PER_FOOT);
const MAX_FEET = Math.floor(MAX_TOTAL_INCHES / INCHES_PER_FOOT);

/**
 * Where each wheel opens. A wheel always shows a value under its centre line,
 * so starting on the midpoint of the range would quietly propose 56 years and
 * 165 cm. These are ordinary starting points the screen says out loud.
 */
const START_AGE = 30;
const START_HEIGHT_CM = 175;
const START_WEIGHT_KG = 75;
const START_FEET = cmToFeetInches(START_HEIGHT_CM);
const MIN_LB = Math.ceil(kgToLb(LIMITS.weightKg.min));
const MAX_LB = Math.floor(kgToLb(LIMITS.weightKg.max));

export default function BodyStep() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { isRTL } = useDirection();
  const { t } = useTranslation(['onboarding', 'common', 'units']);

  // Re-entering this step (a bounce back from a later screen) restores the draft.
  const [initial] = useState(() => parseBodyDraft(params));
  const initialFeetInches = initial ? cmToFeetInches(initial.heightCm) : null;

  const [units, setUnits] = useState<UnitSystem>(initial?.units ?? 'metric');
  const [sex, setSex] = useState<Sex>(initial?.sex ?? 'male');
  const [age, setAge] = useState<number>(initial?.age ?? START_AGE);
  const [heightCm, setHeightCm] = useState<number>(initial?.heightCm ?? START_HEIGHT_CM);
  const [feet, setFeet] = useState<number>(initialFeetInches?.feet ?? START_FEET.feet);
  const [inches, setInches] = useState<number>(initialFeetInches?.inches ?? START_FEET.inches);
  const [weightKg, setWeightKg] = useState<number>(initial?.weightKg ?? START_WEIGHT_KG);
  const [weightLb, setWeightLb] = useState<number>(
    initial ? kgToLb(initial.weightKg) : Math.round(kgToLb(START_WEIGHT_KG)),
  );

  const metric = units === 'metric';

  const unitOptions: SegmentedOption<UnitSystem>[] = [
    { value: 'metric', label: t('onboarding:unitsMetric') },
    { value: 'imperial', label: t('onboarding:unitsImperial') },
  ];

  const sexOptions: SegmentedOption<Sex>[] = [
    { value: 'male', label: t('onboarding:male'), icon: 'male' },
    { value: 'female', label: t('onboarding:female'), icon: 'female' },
  ];

  const feetInchesText = (totalInches: number) =>
    t('onboarding:feetInches', {
      feet: formatCount(Math.floor(totalInches / INCHES_PER_FOOT)),
      inches: formatCount(totalInches % INCHES_PER_FOOT),
    });

  /** Switching units converts what is already typed instead of discarding it. */
  const switchUnits = (next: UnitSystem) => {
    if (next === units) return;

    if (next === 'imperial') {
      const converted = cmToFeetInches(heightCm);
      setFeet(converted.feet);
      setInches(converted.inches);
      setWeightLb(Math.round(kgToLb(weightKg)));
    } else {
      setHeightCm(feetInchesToCm(feet, inches));
      setWeightKg(lbToKg(weightLb));
    }

    setUnits(next);
  };

  const heightValue = metric ? heightCm : feetInchesToCm(feet, inches);

  const weightValue = metric ? weightKg : lbToKg(weightLb);

  // Age and weight are chosen on a wheel that is bounded by LIMITS, so an
  // out-of-range value cannot be produced and needs no error state. Height
  // still can be, because feet and inches are two wheels that combine.
  const inchesError =
    !metric && (inches < 0 || inches >= INCHES_PER_FOOT)
      ? t('onboarding:inchesError')
      : undefined;

  const heightOutOfRange =
    heightValue < LIMITS.heightCm.min || heightValue > LIMITS.heightCm.max;

  const heightError = heightOutOfRange
    ? metric
      ? t('onboarding:heightErrorCm', {
          min: formatCount(LIMITS.heightCm.min),
          max: formatCount(LIMITS.heightCm.max),
        })
      : t('onboarding:heightErrorImperial', {
          min: feetInchesText(MIN_TOTAL_INCHES),
          max: feetInchesText(MAX_TOTAL_INCHES),
        })
    : undefined;

  const heightHelp = inchesError ?? heightError;

  const draft = useMemo<BodyDraft | null>(() => {
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
        title={t('onboarding:bodyTitle')}
        subtitle={t('onboarding:bodySubtitle')}
        onBack={() => router.back()}
      />

      <StepProgress current={1} />

      <SegmentedControl
        options={unitOptions}
        value={units}
        onChange={switchUnits}
        style={styles.units}
      />

      <Txt variant="caption" color="faint" style={styles.startNote}>
        {t('onboarding:wheelStartNote')}
      </Txt>

      <View style={styles.fields}>
        <View>
          <Txt variant="label" color="muted" weight="semibold" style={styles.label}>
            {t('onboarding:sex')}
          </Txt>
          <SegmentedControl options={sexOptions} value={sex} onChange={setSex} />
          <Txt variant="caption" color="faint" style={styles.caption}>
            {t('onboarding:sexNote', { calories: formatCount(SEX_CALORIE_GAP) })}
          </Txt>
        </View>

        <MeasurePicker
          label={t('onboarding:age')}
          value={age}
          onChange={setAge}
          min={LIMITS.age.min}
          max={LIMITS.age.max}
          unit={t('units:years')}
          hint={t('onboarding:ageRange', {
            min: formatCount(LIMITS.age.min),
            max: formatCount(LIMITS.age.max),
          })}
        />

        {metric ? (
          <MeasurePicker
            label={t('onboarding:height')}
            value={heightCm}
            onChange={setHeightCm}
            min={LIMITS.heightCm.min}
            max={LIMITS.heightCm.max}
            unit={t('units:cm')}
            hint={t('onboarding:heightRangeCm', {
              min: formatCount(LIMITS.heightCm.min),
              max: formatCount(LIMITS.heightCm.max),
            })}
          />
        ) : (
          // Two wheels, feet and inches, feeding the same centimetre value.
          <MeasurePicker
            label={t('onboarding:height')}
            value={feet}
            onChange={setFeet}
            min={MIN_FEET}
            max={MAX_FEET}
            unit={t('onboarding:unitFoot')}
            secondary={{
              value: inches,
              onChange: setInches,
              min: 0,
              max: INCHES_PER_FOOT - 1,
              unit: t('onboarding:unitInch'),
            }}
            hint={
              heightHelp ??
              t('onboarding:heightRangeImperial', {
                min: feetInchesText(MIN_TOTAL_INCHES),
                max: feetInchesText(MAX_TOTAL_INCHES),
              })
            }
          />
        )}

        {metric ? (
          <MeasurePicker
            label={t('onboarding:weight')}
            value={weightKg}
            onChange={setWeightKg}
            min={LIMITS.weightKg.min}
            max={LIMITS.weightKg.max}
            step={0.5}
            unit={t('units:kg')}
            hint={t('onboarding:weightRangeKg', {
              min: formatCount(LIMITS.weightKg.min),
              max: formatCount(LIMITS.weightKg.max),
            })}
          />
        ) : (
          <MeasurePicker
            label={t('onboarding:weight')}
            value={weightLb}
            onChange={setWeightLb}
            min={MIN_LB}
            max={MAX_LB}
            unit={t('units:lb')}
            hint={t('onboarding:weightRangeLb', {
              min: formatCount(MIN_LB),
              max: formatCount(MAX_LB),
            })}
          />
        )}
      </View>

      <View style={styles.spacer} />

      <Button
        label={t('common:continue')}
        iconRight={mirrorIcon('arrow-forward', isRTL)}
        size="lg"
        fullWidth
        disabled={!draft}
        onPress={handleContinue}
        accessibilityHint={t('onboarding:bodyContinueHint')}
        style={styles.continue}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  units: {
    marginBottom: spacing.xl,
  },
  startNote: {
    marginBottom: spacing.md,
    marginStart: spacing.xs,
  },
  fields: {
    rowGap: spacing.lg,
  },
  label: {
    marginBottom: spacing.xs + 2,
    marginStart: spacing.xs / 2,
  },
  caption: {
    marginStart: spacing.xs,
    marginTop: spacing.xs + 2,
  },
  spacer: {
    flexGrow: 1,
    minHeight: spacing.xl,
  },
  continue: {
    marginTop: spacing.xl,
  },
});
