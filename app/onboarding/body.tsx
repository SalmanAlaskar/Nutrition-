import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const [age, setAge] = useState<number | null>(initial?.age ?? null);
  const [heightCm, setHeightCm] = useState<number | null>(initial?.heightCm ?? null);
  const [feet, setFeet] = useState<number | null>(initialFeetInches?.feet ?? null);
  const [inches, setInches] = useState<number | null>(initialFeetInches?.inches ?? null);
  const [weightKg, setWeightKg] = useState<number | null>(initial?.weightKg ?? null);
  const [weightLb, setWeightLb] = useState<number | null>(
    initial ? kgToLb(initial.weightKg) : null,
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
      ? t('onboarding:ageError', {
          min: formatCount(LIMITS.age.min),
          max: formatCount(LIMITS.age.max),
        })
      : undefined;

  const inchesError =
    !metric && inches !== null && (inches < 0 || inches >= INCHES_PER_FOOT)
      ? t('onboarding:inchesError')
      : undefined;

  const heightOutOfRange =
    heightValue !== null &&
    (heightValue < LIMITS.heightCm.min || heightValue > LIMITS.heightCm.max);

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

  const weightOutOfRange =
    weightValue !== null &&
    (weightValue < LIMITS.weightKg.min || weightValue > LIMITS.weightKg.max);

  const weightError = weightOutOfRange
    ? metric
      ? t('onboarding:weightErrorKg', {
          min: formatCount(LIMITS.weightKg.min),
          max: formatCount(LIMITS.weightKg.max),
        })
      : t('onboarding:weightErrorLb', {
          min: formatCount(MIN_LB),
          max: formatCount(MAX_LB),
        })
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

        <NumberField
          label={t('onboarding:age')}
          value={age}
          onChange={setAge}
          suffix={t('units:years')}
          placeholder="30"
          hint={t('onboarding:ageRange', {
            min: formatCount(LIMITS.age.min),
            max: formatCount(LIMITS.age.max),
          })}
          error={ageError}
        />

        {metric ? (
          <NumberField
            label={t('onboarding:height')}
            value={heightCm}
            onChange={setHeightCm}
            suffix={t('units:cm')}
            placeholder="175"
            hint={t('onboarding:heightRangeCm', {
              min: formatCount(LIMITS.heightCm.min),
              max: formatCount(LIMITS.heightCm.max),
            })}
            error={heightError}
          />
        ) : (
          <View>
            <Txt variant="label" color="muted" weight="semibold" style={styles.label}>
              {t('onboarding:height')}
            </Txt>
            <View style={styles.row}>
              <NumberField
                label={t('onboarding:feet')}
                value={feet}
                onChange={setFeet}
                suffix={t('onboarding:unitFoot')}
                placeholder="5"
                style={styles.rowItem}
              />
              <NumberField
                label={t('onboarding:inches')}
                value={inches}
                onChange={setInches}
                suffix={t('onboarding:unitInch')}
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
                t('onboarding:heightRangeImperial', {
                  min: feetInchesText(MIN_TOTAL_INCHES),
                  max: feetInchesText(MAX_TOTAL_INCHES),
                })}
            </Txt>
          </View>
        )}

        {metric ? (
          <NumberField
            label={t('onboarding:weight')}
            value={weightKg}
            onChange={setWeightKg}
            suffix={t('units:kg')}
            placeholder="75"
            hint={t('onboarding:weightRangeKg', {
              min: formatCount(LIMITS.weightKg.min),
              max: formatCount(LIMITS.weightKg.max),
            })}
            error={weightError}
          />
        ) : (
          <NumberField
            label={t('onboarding:weight')}
            value={weightLb}
            onChange={setWeightLb}
            suffix={t('units:lb')}
            placeholder="165"
            hint={t('onboarding:weightRangeLb', {
              min: formatCount(MIN_LB),
              max: formatCount(MAX_LB),
            })}
            error={weightError}
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
