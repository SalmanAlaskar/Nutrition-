import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type AccessibilityProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { CATEGORY_LABELS } from '@/data/foods';
import { currentSlot, formatDayLabel, todayKey } from '@/domain/date';
import { makeId } from '@/domain/id';
import { caloriesFromMacros, macrosForGrams } from '@/domain/nutrition';
import { MEAL_SLOTS, SLOT_LABELS } from '@/domain/totals';
import { useApp } from '@/state/AppStore';
import { spacing, useTheme } from '@/theme';
import type { FoodCategory, FoodItem, Macros, MealSlot, ServingOption } from '@/types';

import { formatCount } from '../onboarding/_layout';

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
  ...(Object.keys(CATEGORY_LABELS) as FoodCategory[]).filter(
    (category) => category !== DEFAULT_CATEGORY,
  ),
];
const DEFAULT_SERVING_GRAMS = 100;
const DEFAULT_SERVING_NAME = '1 serving';

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

/** Prints 250 rather than 250.0, so labels read like the bundled database. */
function formatGrams(value: number): string {
  const rounded = round1(value);
  if (Number.isInteger(rounded)) return formatCount(rounded);
  const [whole, fraction] = rounded.toFixed(1).split('.');
  return `${formatCount(Number(whole))}.${fraction}`;
}

function requiredNumberError(
  value: number | null,
  max: number,
  unit: string,
): string | undefined {
  if (value === null) return 'Enter a number. Use 0 if there is none.';
  if (!Number.isFinite(value) || value < 0) return 'Use a number of 0 or more.';
  if (value > max) return `More than ${max} ${unit} in 100 g is not possible.`;
  return undefined;
}

function optionalNumberError(
  value: number | null,
  max: number,
  unit: string,
): string | undefined {
  if (value === null) return undefined;
  return requiredNumberError(value, max, unit);
}

/** "a name", "a name and the numbers", "a name, the numbers and a weight". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Define a food the bundled database does not carry. Everything is entered per
 * 100 g, with one named serving on top, so the result behaves exactly like a
 * database row once it is saved and searchable.
 */
export default function CustomFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slot?: string; date?: string; name?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { addCustomFood } = useApp();

  const slot = readSlot(params.slot);
  const date = readDate(params.date);

  const [initialName] = useState(() => (firstParam(params.name) ?? '').trim());

  const [name, setName] = useState(initialName);
  const [nameAr, setNameAr] = useState('');
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

  const trimmedName = name.trim();

  const nameError = trimmedName.length === 0 ? 'Give this food a name.' : undefined;
  const caloriesError = requiredNumberError(calories, MAX_CALORIES, 'kcal');
  const proteinError = requiredNumberError(protein, MAX_MACRO_GRAMS, 'g');
  const carbsError = requiredNumberError(carbs, MAX_MACRO_GRAMS, 'g');
  const fatError = requiredNumberError(fat, MAX_MACRO_GRAMS, 'g');
  const fiberError = optionalNumberError(fiber, MAX_MACRO_GRAMS, 'g');

  const servingError =
    servingGrams === null
      ? 'Enter what one serving weighs.'
      : !Number.isFinite(servingGrams) || servingGrams <= 0
        ? 'A serving has to weigh more than 0 g.'
        : servingGrams > MAX_SERVING_GRAMS
          ? `Keep a serving under ${MAX_SERVING_GRAMS} g.`
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
  const servingTitle = servingName.trim() || DEFAULT_SERVING_NAME;
  const servingLabel = `${servingTitle} (${formatGrams(servingWeight)} g)`;
  const servingMacros = useMemo(
    () => macrosForGrams(per100, servingWeight),
    [per100, servingWeight],
  );

  const missing = useMemo(() => {
    const items: string[] = [];
    if (trimmedName.length === 0) items.push('a name');
    if (calories === null || protein === null || carbs === null || fat === null) {
      items.push('the values per 100 g');
    }
    if (servingGrams === null) items.push('a serving weight');
    return items;
  }, [trimmedName, calories, protein, carbs, fat, servingGrams]);

  const footerHint = valid
    ? servingLabel
    : missing.length > 0
      ? `Add ${joinList(missing)}`
      : 'Fix the highlighted fields';

  const macroLine = `P ${formatGrams(servingMacros.protein)} g · C ${formatGrams(
    servingMacros.carbs,
  )} g · F ${formatGrams(servingMacros.fat)} g${
    servingMacros.fiber !== undefined ? ` · Fibre ${formatGrams(servingMacros.fiber)} g` : ''
  }`;

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
    const food: FoodItem = {
      id: makeId('food'),
      name: trimmedName,
      category,
      per100,
      servings: [serving],
    };
    const arabic = nameAr.trim();
    if (arabic.length > 0) food.nameAr = arabic;

    try {
      await addCustomFood(food);
      goBack();
    } catch {
      setSaving(false);
      setSaveError('Could not save this food. Please try again.');
    }
  }, [
    saving,
    valid,
    servingLabel,
    servingWeight,
    trimmedName,
    category,
    per100,
    nameAr,
    addCustomFood,
    goBack,
  ]);

  return (
    <Screen padded={false} keyboardAvoiding>
      <View style={styles.top}>
        <AppHeader
          title="Custom food"
          subtitle={`${SLOT_LABELS[slot]} · ${formatDayLabel(date)}`}
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
          <Txt variant="heading">Food</Txt>
        </View>
        <Txt variant="label" color="muted" style={styles.sectionBody}>
          What you will search for later. Everything here is saved to this device only.
        </Txt>

        <TextField
          label="Name"
          value={name}
          style={styles.field}
          onChangeText={(text) => {
            touch('name');
            setName(text);
          }}
          placeholder="Grandma's lamb saleeg"
          maxLength={NAME_MAX}
          autoCapitalize="sentences"
          autoFocus={initialName.length === 0}
          error={touched.name ? nameError : undefined}
        />

        <TextField
          label="Arabic name"
          value={nameAr}
          onChangeText={setNameAr}
          placeholder="سليق باللحم"
          maxLength={NAME_MAX}
          autoCapitalize="none"
          hint="Optional. Lets you find this food when you search in Arabic."
          style={styles.field}
        />

        <View style={styles.field}>
          <Txt variant="label" color="muted" weight="medium" style={styles.label}>
            Category
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
                label={CATEGORY_LABELS[value]}
                selected={category === value}
                onPress={() => setCategory(value)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.sectionHead}>
          <Txt variant="heading">Nutrition</Txt>
          <Badge label="per 100 g" tone="accent" />
        </View>
        <Txt variant="label" color="muted" style={styles.sectionBody}>
          Copy the 100 g column from the label, or the numbers for 100 g of the cooked
          dish. The portion you actually eat comes from the serving below.
        </Txt>

        <NumberField
          key={`calories-${calorieFieldKey}`}
          label="Calories"
          value={calories}
          onChange={(value) => {
            touch('calories');
            setCalories(value);
          }}
          suffix="kcal /100 g"
          placeholder="0"
          min={0}
          max={MAX_CALORIES}
          error={touched.calories ? caloriesError : undefined}
          style={styles.field}
        />

        <NumberField
          label="Protein"
          value={protein}
          onChange={(value) => {
            touch('protein');
            setProtein(value);
          }}
          suffix="g /100 g"
          placeholder="0"
          min={0}
          max={MAX_MACRO_GRAMS}
          error={touched.protein ? proteinError : undefined}
          style={styles.field}
        />

        <NumberField
          label="Carbs"
          value={carbs}
          onChange={(value) => {
            touch('carbs');
            setCarbs(value);
          }}
          suffix="g /100 g"
          placeholder="0"
          min={0}
          max={MAX_MACRO_GRAMS}
          error={touched.carbs ? carbsError : undefined}
          style={styles.field}
        />

        <NumberField
          label="Fat"
          value={fat}
          onChange={(value) => {
            touch('fat');
            setFat(value);
          }}
          suffix="g /100 g"
          placeholder="0"
          min={0}
          max={MAX_MACRO_GRAMS}
          error={touched.fat ? fatError : undefined}
          style={styles.field}
        />

        <NumberField
          label="Fibre"
          value={fiber}
          onChange={(value) => {
            touch('fiber');
            setFiber(value);
          }}
          suffix="g /100 g"
          placeholder="Optional"
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
                Worth a second look
              </Txt>
            </View>
            <Txt variant="label" color="muted" style={styles.warningBody}>
              {`${formatGrams(per100.protein)} g protein, ${formatGrams(per100.carbs)} g carbs and ${formatGrams(per100.fat)} g fat work out to ${formatCount(drift.implied)} kcal per 100 g, not ${formatCount(drift.typed)}. Keep your number if that is what the label says.`}
            </Txt>
            <Button
              label={`Use ${formatCount(drift.implied)} kcal`}
              icon="swap-horizontal"
              variant="secondary"
              size="sm"
              onPress={useImpliedCalories}
              accessibilityHint="Replaces the calories you typed with the value the macros imply"
              style={styles.warningAction}
            />
          </Card>
        ) : null}

        <View style={styles.sectionHead}>
          <Txt variant="heading">Serving</Txt>
        </View>
        <Txt variant="label" color="muted" style={styles.sectionBody}>
          The portion offered first when you add this food to a meal.
        </Txt>

        <TextField
          label="Call it"
          value={servingName}
          onChangeText={setServingName}
          placeholder={DEFAULT_SERVING_NAME}
          maxLength={SERVING_NAME_MAX}
          autoCapitalize="none"
          style={styles.field}
        />

        <NumberField
          label="One of those weighs"
          value={servingGrams}
          onChange={(value) => {
            touch('serving');
            setServingGrams(value);
          }}
          suffix="g"
          placeholder="100"
          min={1}
          max={MAX_SERVING_GRAMS}
          error={touched.serving ? servingError : undefined}
          style={styles.field}
        />

        <Txt variant="caption" color="faint" style={styles.servingNote}>
          {`Saved as “${servingLabel}”`}
        </Txt>

        <Card style={styles.preview}>
          <View style={styles.previewHead}>
            <Txt variant="caption" color="faint" weight="semibold" style={styles.previewLabel}>
              ONE SERVING ADDS
            </Txt>
            <Badge label={CATEGORY_LABELS[category]} />
          </View>

          <Txt weight="medium" numberOfLines={1}>
            {servingLabel}
          </Txt>

          <View style={styles.previewValue}>
            <Txt variant="title" tabular>
              {formatCount(servingMacros.calories)}
            </Txt>
            <Txt variant="label" color="faint" style={styles.previewUnit}>
              kcal
            </Txt>
          </View>

          <Txt variant="label" color="muted" tabular>
            {macroLine}
          </Txt>

          <Txt variant="caption" color="faint" style={styles.previewFoot}>
            {`Scaled from ${formatCount(per100.calories)} kcal per 100 g.`}
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
            accessibilityLabel={`${formatCount(servingMacros.calories)} kilocalories per serving. ${footerHint}`}
          >
            <View style={styles.summaryValue}>
              <Txt variant="heading" tabular numberOfLines={1}>
                {formatCount(servingMacros.calories)}
              </Txt>
              <Txt variant="label" color="faint" weight="medium">
                kcal
              </Txt>
            </View>
            <Txt variant="label" color="muted" numberOfLines={1} style={styles.summaryMeta}>
              {footerHint}
            </Txt>
          </View>

          <Button
            label="Save food"
            icon="checkmark"
            onPress={() => void save()}
            disabled={!valid}
            loading={saving}
            accessibilityHint="Saves this food and returns to the search"
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
    marginLeft: spacing.xs,
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
