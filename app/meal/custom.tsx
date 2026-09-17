import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type AccessibilityProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FOOD_CATEGORIES, useFoodLabels } from '@/components/meal/useFoodLabels';
import { useDayLabels } from '@/components/today/useDayLabels';
import {
  AppHeader,
  Badge,
  Button,
  Card,
  Chip,
  NumberField,
  Screen,
  TextField,
  Txt,
} from '@/components/ui';
import { currentSlot, todayKey } from '@/domain/date';
import { formatAmount, formatCount } from '@/domain/format';
import { makeId } from '@/domain/id';
import { caloriesFromMacros, macrosForGrams } from '@/domain/nutrition';
import { MEAL_SLOTS } from '@/domain/totals';
import { useDirection } from '@/i18n';
import { useApp } from '@/state/AppStore';
import { spacing, useTheme } from '@/theme';
import type { FoodCategory, FoodItem, Macros, MealSlot, ServingOption } from '@/types';

/** Decoration only: the surrounding text already carries the meaning. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

/** Something cooked at home is the usual reason to end up on this screen. */
const DEFAULT_CATEGORY: FoodCategory = 'dishes';

/** Every category, with the default one leading so the selection is on screen. */
const CATEGORIES: FoodCategory[] = [
  DEFAULT_CATEGORY,
  ...FOOD_CATEGORIES.filter((category) => category !== DEFAULT_CATEGORY),
];
const DEFAULT_SERVING_GRAMS = 100;

const NAME_MAX = 80;
const SERVING_NAME_MAX = 40;

/** Per 100 g ceilings: pure fat is 900 kcal, and no nutrient can exceed the mass. */
const MAX_CALORIES = 900;
const MAX_MACRO_GRAMS = 100;
const MAX_SERVING_GRAMS = 5000;

/** How far the typed calories may drift from the macro maths before we say so. */
const CALORIE_DRIFT = 0.2;
/** Below this gap the disagreement is rounding, not a mistake worth raising. */
const CALORIE_DRIFT_MIN_KCAL = 25;

type FieldKey = 'name' | 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'serving';

const UNTOUCHED: Record<FieldKey, boolean> = {
  name: false,
  calories: false,
  protein: false,
  carbs: false,
  fat: false,
  fiber: false,
  serving: false,
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readSlot(value: string | string[] | undefined): MealSlot {
  const candidate = firstParam(value);
  return MEAL_SLOTS.find((slot) => slot === candidate) ?? currentSlot();
}

function readDate(value: string | string[] | undefined): string {
  const candidate = firstParam(value);
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : todayKey();
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Define a food the bundled database does not carry. Everything is entered per
 * 100 g, with one named serving on top, so the result behaves exactly like a
 * database row once it is saved and searchable.
 */
export default function CustomFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slot?: string; date?: string; name?: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation(['meals', 'macros', 'units', 'common']);
  const { isRTL } = useDirection();
  const labels = useFoodLabels();
  const dayLabels = useDayLabels();
  const insets = useSafeAreaInsets();
  const { addCustomFood } = useApp();

  const slot = readSlot(params.slot);
  const date = readDate(params.date);

  const [initialName] = useState(() => (firstParam(params.name) ?? '').trim());

  // The first field is the name in the language being read, the second is the
  // name in the other one. Which of the two lands in `nameAr` is decided on save.
  const [name, setName] = useState(initialName);
  const [otherName, setOtherName] = useState('');
  const [category, setCategory] = useState<FoodCategory>(DEFAULT_CATEGORY);

  const [calories, setCalories] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [carbs, setCarbs] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const [fiber, setFiber] = useState<number | null>(null);

  const [servingName, setServingName] = useState('');
  const [servingGrams, setServingGrams] = useState<number | null>(DEFAULT_SERVING_GRAMS);

  const [touched, setTouched] = useState(UNTOUCHED);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * Bumped when the calories field is written from outside. A focused
   * NumberField keeps showing what was typed until it blurs, and then pushes
   * that stale text back up, so the one-tap fix has to remount it.
   */
  const [calorieFieldKey, setCalorieFieldKey] = useState(0);

  const touch = useCallback((key: FieldKey) => {
    setTouched((current) => (current[key] ? current : { ...current, [key]: true }));
  }, []);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/meal/add', params: { slot, date } });
  }, [router, slot, date]);

  const numberError = useCallback(
    (value: number | null, max: number, kind: 'calories' | 'grams'): string | undefined => {
      if (value === null) return t('meals:customNumberMissing');
      if (!Number.isFinite(value) || value < 0) return t('meals:customNumberNegative');
      if (value > max) {
        return kind === 'calories'
          ? t('meals:customKcalMax', { max: formatCount(max) })
          : t('meals:customGramMax', { max: formatCount(max) });
      }
      return undefined;
    },
    [t],
  );

  const trimmedName = name.trim();

  const nameError = trimmedName.length === 0 ? t('meals:customNameError') : undefined;
  const caloriesError = numberError(calories, MAX_CALORIES, 'calories');
  const proteinError = numberError(protein, MAX_MACRO_GRAMS, 'grams');
  const carbsError = numberError(carbs, MAX_MACRO_GRAMS, 'grams');
  const fatError = numberError(fat, MAX_MACRO_GRAMS, 'grams');
  const fiberError = fiber === null ? undefined : numberError(fiber, MAX_MACRO_GRAMS, 'grams');

  const servingError =
    servingGrams === null
      ? t('meals:customServingMissing')
      : !Number.isFinite(servingGrams) || servingGrams <= 0
        ? t('meals:customServingZero')
        : servingGrams > MAX_SERVING_GRAMS
          ? t('meals:customServingMax', { max: formatCount(MAX_SERVING_GRAMS) })
          : undefined;

  const valid =
    !nameError &&
    !caloriesError &&
    !proteinError &&
    !carbsError &&
    !fatError &&
    !fiberError &&
    !servingError;

  const per100 = useMemo<Macros>(() => {
    const macros: Macros = {
      calories: Math.round(calories ?? 0),
      protein: round1(protein ?? 0),
      carbs: round1(carbs ?? 0),
      fat: round1(fat ?? 0),
    };
    if (fiber !== null) macros.fiber = round1(fiber);
    return macros;
  }, [calories, protein, carbs, fat, fiber]);

  const impliedCalories = useMemo(() => caloriesFromMacros(per100), [per100]);

  /**
   * Warn, never block: a label can legitimately disagree with 4/4/9 maths.
   * It stays quiet until all four numbers are in and valid, so it reads as a
   * cross-check on a finished set rather than a complaint about a half-typed one.
   */
  const drift = useMemo(() => {
    if (calories === null || protein === null || carbs === null || fat === null) return null;
    if (!Number.isFinite(calories)) return null;
    if (caloriesError || proteinError || carbsError || fatError) return null;
    if (impliedCalories <= 0) return null;
    const typed = Math.round(calories);
    const gap = Math.abs(typed - impliedCalories);
    if (gap < CALORIE_DRIFT_MIN_KCAL) return null;
    return gap / impliedCalories > CALORIE_DRIFT ? { typed, implied: impliedCalories } : null;
  }, [
    calories,
    protein,
    carbs,
    fat,
    caloriesError,
    proteinError,
    carbsError,
    fatError,
    impliedCalories,
  ]);

  const servingWeight = round1(servingGrams ?? 0);
  const servingTitle = servingName.trim() || t('meals:customServingDefault');
  const servingLabel = `${servingTitle} (${labels.weight(servingWeight)})`;
  const servingMacros = useMemo(
    () => macrosForGrams(per100, servingWeight),
    [per100, servingWeight],
  );

  const missing = useMemo(() => {
    const items: string[] = [];
    if (trimmedName.length === 0) items.push(t('meals:customMissingName'));
    if (calories === null || protein === null || carbs === null || fat === null) {
      items.push(t('meals:customMissingValues'));
    }
    if (servingGrams === null) items.push(t('meals:customMissingServing'));
    return items;
  }, [trimmedName, calories, protein, carbs, fat, servingGrams, t]);

  const footerHint = valid
    ? servingLabel
    : missing.length > 0
      ? t('meals:customMissingPrefix', {
          items:
            missing.length === 1
              ? missing[0]
              : `${missing.slice(0, -1).join(t('meals:customListSeparator'))}` +
                `${t('meals:customListLast')}${missing[missing.length - 1]}`,
        })
      : t('meals:customFixFields');

  const useImpliedCalories = useCallback(() => {
    if (!drift) return;
    touch('calories');
    setCalories(drift.implied);
    setCalorieFieldKey((current) => current + 1);
  }, [drift, touch]);

  const save = useCallback(async () => {
    // `valid` already guarantees a name, finite non-negative macros and a weight.
    if (saving || !valid) return;

    setSaving(true);
    setSaveError(null);

    const serving: ServingOption = { label: servingLabel, grams: servingWeight };
    const other = otherName.trim();
    const food: FoodItem = {
      id: makeId('food'),
      // Arabic goes in `nameAr` whichever field it was typed into, so search and
      // the Arabic label keep working the same way as for a bundled food.
      name: isRTL ? other || trimmedName : trimmedName,
      category,
      per100,
      servings: [serving],
    };
    if (isRTL) {
      if (other.length > 0) food.nameAr = trimmedName;
    } else if (other.length > 0) {
      food.nameAr = other;
    }

    try {
      await addCustomFood(food);
      goBack();
    } catch {
      setSaving(false);
      setSaveError(t('meals:customSaveError'));
    }
  }, [
    saving,
    valid,
    servingLabel,
    servingWeight,
    trimmedName,
    otherName,
    isRTL,
    category,
    per100,
    addCustomFood,
    goBack,
    t,
  ]);

  return (
    <Screen padded={false} keyboardAvoiding>
      <View style={styles.top}>
        <AppHeader
          title={t('meals:customTitle')}
          subtitle={`${labels.slot(slot)} · ${dayLabels.day(date)}`}
          onBack={goBack}
        />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeadFirst}>
          <Txt variant="heading">{t('meals:customFoodSection')}</Txt>
        </View>
        <Txt variant="label" color="muted" style={styles.sectionBody}>
          {t('meals:customFoodBody')}
        </Txt>

        <TextField
          label={t('meals:customName')}
          value={name}
          style={styles.field}
          onChangeText={(text) => {
            touch('name');
            setName(text);
          }}
          placeholder={t('meals:customNamePlaceholder')}
          maxLength={NAME_MAX}
          autoCapitalize="sentences"
          autoFocus={initialName.length === 0}
          error={touched.name ? nameError : undefined}
        />

        <TextField
          label={t('meals:customOtherName')}
          value={otherName}
          onChangeText={setOtherName}
          placeholder={t('meals:customOtherNamePlaceholder')}
          maxLength={NAME_MAX}
          autoCapitalize="none"
          hint={t('meals:customOtherNameHint')}
          style={styles.field}
        />

        <View style={styles.field}>
          <Txt variant="label" color="muted" weight="medium" style={styles.label}>
            {t('meals:customCategory')}
          </Txt>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.chipStrip}
            contentContainerStyle={styles.chips}
          >
            {CATEGORIES.map((value) => (
              <Chip
                key={value}
                label={labels.category(value)}
                selected={category === value}
                onPress={() => setCategory(value)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.sectionHead}>
          <Txt variant="heading">{t('meals:customNutritionSection')}</Txt>
          <Badge label={t('meals:customPer100Badge')} tone="accent" />
        </View>
        <Txt variant="label" color="muted" style={styles.sectionBody}>
          {t('meals:customNutritionBody')}
        </Txt>

        <NumberField
          key={`calories-${calorieFieldKey}`}
          label={t('macros:calories')}
          value={calories}
          onChange={(value) => {
            touch('calories');
            setCalories(value);
          }}
          suffix={t('meals:customKcalSuffix')}
          placeholder="0"
          min={0}
          max={MAX_CALORIES}
          error={touched.calories ? caloriesError : undefined}
          style={styles.field}
        />

        <NumberField
          label={t('macros:protein')}
          value={protein}
          onChange={(value) => {
            touch('protein');
            setProtein(value);
          }}
          suffix={t('meals:customGramSuffix')}
          placeholder="0"
          min={0}
          max={MAX_MACRO_GRAMS}
          error={touched.protein ? proteinError : undefined}
          style={styles.field}
        />

        <NumberField
          label={t('macros:carbs')}
          value={carbs}
          onChange={(value) => {
            touch('carbs');
            setCarbs(value);
          }}
          suffix={t('meals:customGramSuffix')}
          placeholder="0"
          min={0}
          max={MAX_MACRO_GRAMS}
          error={touched.carbs ? carbsError : undefined}
          style={styles.field}
        />

        <NumberField
          label={t('macros:fat')}
          value={fat}
          onChange={(value) => {
            touch('fat');
            setFat(value);
          }}
          suffix={t('meals:customGramSuffix')}
          placeholder="0"
          min={0}
          max={MAX_MACRO_GRAMS}
          error={touched.fat ? fatError : undefined}
          style={styles.field}
        />

        <NumberField
          label={t('macros:fiber')}
          value={fiber}
          onChange={(value) => {
            touch('fiber');
            setFiber(value);
          }}
          suffix={t('meals:customGramSuffix')}
          placeholder={t('common:optional')}
          min={0}
          max={MAX_MACRO_GRAMS}
          error={touched.fiber ? fiberError : undefined}
          style={styles.field}
        />

        {drift ? (
          <Card style={[styles.warning, { borderColor: colors.warning }]}>
            <View style={styles.warningHead}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={colors.warning}
                {...DECORATIVE}
              />
              <Txt variant="label" weight="semibold" color="warning">
                {t('meals:customDriftTitle')}
              </Txt>
            </View>
            <Txt variant="label" color="muted" style={styles.warningBody}>
              {t('meals:customDriftBody', {
                protein: formatAmount(per100.protein, 1),
                carbs: formatAmount(per100.carbs, 1),
                fat: formatAmount(per100.fat, 1),
                implied: formatCount(drift.implied),
                typed: formatCount(drift.typed),
              })}
            </Txt>
            <Button
              label={t('meals:customDriftAction', { value: formatCount(drift.implied) })}
              icon="swap-horizontal"
              variant="secondary"
              size="sm"
              onPress={useImpliedCalories}
              accessibilityHint={t('meals:customDriftHint')}
              style={styles.warningAction}
            />
          </Card>
        ) : null}

        <View style={styles.sectionHead}>
          <Txt variant="heading">{t('meals:customServingSection')}</Txt>
        </View>
        <Txt variant="label" color="muted" style={styles.sectionBody}>
          {t('meals:customServingBody')}
        </Txt>

        <TextField
          label={t('meals:customServingName')}
          value={servingName}
          onChangeText={setServingName}
          placeholder={t('meals:customServingDefault')}
          maxLength={SERVING_NAME_MAX}
          autoCapitalize="none"
          style={styles.field}
        />

        <NumberField
          label={t('meals:customServingWeight')}
          value={servingGrams}
          onChange={(value) => {
            touch('serving');
            setServingGrams(value);
          }}
          suffix={t('units:gram')}
          placeholder="100"
          min={1}
          max={MAX_SERVING_GRAMS}
          error={touched.serving ? servingError : undefined}
          style={styles.field}
        />

        <Txt variant="caption" color="faint" style={styles.servingNote}>
          {t('meals:customServingSaved', { label: servingLabel })}
        </Txt>

        <Card style={styles.preview}>
          <View style={styles.previewHead}>
            <Txt variant="caption" color="faint" weight="semibold" style={styles.previewLabel}>
              {t('meals:customPreviewTitle')}
            </Txt>
            <Badge label={labels.category(category)} />
          </View>

          <Txt weight="medium" numberOfLines={1}>
            {servingLabel}
          </Txt>

          <View style={styles.previewValue}>
            <Txt variant="title" tabular>
              {formatCount(servingMacros.calories)}
            </Txt>
            <Txt variant="label" color="faint" style={styles.previewUnit}>
              {t('units:kcal')}
            </Txt>
          </View>

          <Txt variant="label" color="muted" tabular>
            {labels.macroLine(servingMacros)}
          </Txt>

          <Txt variant="caption" color="faint" style={styles.previewFoot}>
            {t('meals:customPreviewFoot', { value: formatCount(per100.calories) })}
          </Txt>
        </Card>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, spacing.md),
          },
        ]}
      >
        {saveError ? (
          <Txt variant="caption" color="danger" style={styles.footerError}>
            {saveError}
          </Txt>
        ) : null}

        <View style={styles.footerBar}>
          <View
            style={styles.summary}
            accessible
            accessibilityLabel={t('meals:customFooterSpoken', {
              value: formatCount(servingMacros.calories),
              hint: footerHint,
            })}
          >
            <View style={styles.summaryValue}>
              <Txt variant="heading" tabular numberOfLines={1}>
                {formatCount(servingMacros.calories)}
              </Txt>
              <Txt variant="label" color="faint" weight="medium">
                {t('units:kcal')}
              </Txt>
            </View>
            <Txt variant="label" color="muted" numberOfLines={1} style={styles.summaryMeta}>
              {footerHint}
            </Txt>
          </View>

          <Button
            label={t('meals:customSave')}
            icon="checkmark"
            onPress={() => void save()}
            disabled={!valid}
            loading={saving}
            accessibilityHint={t('meals:customSaveHint')}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    paddingHorizontal: spacing.lg,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  field: {
    marginTop: spacing.lg,
  },
  label: {
    marginBottom: spacing.xs + 2,
  },
  chipStrip: {
    flexGrow: 0,
    marginHorizontal: -spacing.lg,
  },
  chips: {
    columnGap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  sectionHead: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginTop: spacing.xxl,
  },
  sectionHeadFirst: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  sectionBody: {
    marginTop: spacing.xs,
  },
  warning: {
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  warningHead: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  warningBody: {
    marginTop: spacing.sm,
  },
  warningAction: {
    marginTop: spacing.md,
  },
  servingNote: {
    marginStart: spacing.xs,
    marginTop: spacing.sm,
  },
  preview: {
    marginTop: spacing.lg,
  },
  previewHead: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  previewLabel: {
    flexShrink: 1,
    letterSpacing: 0.8,
  },
  previewValue: {
    alignItems: 'baseline',
    columnGap: spacing.xs,
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  previewUnit: {
    marginBottom: 2,
  },
  previewFoot: {
    marginTop: spacing.sm,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  footerError: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  footerBar: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  summary: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  summaryValue: {
    alignItems: 'baseline',
    columnGap: spacing.xs,
    flexDirection: 'row',
  },
  summaryMeta: {
    marginTop: 2,
  },
});
