import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, Divider, IconButton, NumberField, Txt } from '@/components/ui';
import { entryFromFood } from '@/data/foodSearch';
import { formatAmount, formatCount } from '@/domain/format';
import { EMPTY_MACROS, macrosForGrams } from '@/domain/nutrition';
import { radius, spacing, useTheme } from '@/theme';
import type { FoodItem, Macros, MealEntry, ServingOption } from '@/types';

import { useFoodLabels } from './useFoodLabels';

export interface PortionSheetProps {
  /** Food being portioned. Kept around while the sheet animates out. */
  food: FoodItem | null;
  visible: boolean;
  onClose: () => void;
  onAdd: (entry: MealEntry) => void;
  /** Marks the entry as user-created rather than database-sourced. */
  custom?: boolean;
}

/** How the portion is being expressed, which decides the saved label. */
type PortionMode = 'serving' | 'grams';

const QUANTITY_STEPS = [0.5, 1, 1.5, 2, 3];

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** The food's own portions, always with a flat 100 g fallback to type into. */
function portionOptions(food: FoodItem): ServingOption[] {
  const unit = food.liquid ? 'ml' : 'g';
  const listed = food.servings.filter((option) => option.grams > 0);
  if (listed.some((option) => option.grams === 100)) return listed;
  return [...listed, { label: `100 ${unit}`, grams: 100 }];
}

export function PortionSheet({ food, visible, onClose, onAdd, custom = false }: PortionSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation(['meals', 'macros', 'units']);
  const labels = useFoodLabels();
  const insets = useSafeAreaInsets();

  const [servingIndex, setServingIndex] = useState(0);
  const [quantity, setQuantity] = useState<number | null>(1);
  const [grams, setGrams] = useState<number | null>(null);
  const [mode, setMode] = useState<PortionMode>('serving');

  const servings = useMemo(() => (food ? portionOptions(food) : []), [food]);
  const serving: ServingOption | undefined = servings[servingIndex] ?? servings[0];
  const liquid = food?.liquid ?? false;

  // Each newly picked food starts at one of its first listed portion.
  useEffect(() => {
    if (!food) return;
    const first = portionOptions(food)[0];
    setServingIndex(0);
    setQuantity(1);
    setGrams(first ? first.grams : 100);
    setMode('serving');
  }, [food]);

  const selectServing = useCallback(
    (index: number) => {
      const option = servings[index];
      if (!option) return;
      const count = quantity && quantity > 0 ? quantity : 1;
      setServingIndex(index);
      setQuantity(count);
      setGrams(round(count * option.grams, 1));
      setMode('serving');
    },
    [servings, quantity],
  );

  const changeQuantity = useCallback(
    (next: number | null) => {
      setQuantity(next);
      setMode('serving');
      setGrams(next === null || !serving ? null : round(next * serving.grams, 1));
    },
    [serving],
  );

  const changeGrams = useCallback(
    (next: number | null) => {
      setGrams(next);
      setMode('grams');
      setQuantity(
        next === null || !serving || serving.grams <= 0 ? null : round(next / serving.grams, 2),
      );
    },
    [serving],
  );

  const macros: Macros = useMemo(
    () => (food ? macrosForGrams(food.per100, grams ?? 0) : EMPTY_MACROS),
    [food, grams],
  );

  /** The serving as the entry stores it, in the words the database uses. */
  const savedLabel = useMemo(() => {
    if (mode === 'grams' || !serving) return undefined;
    const count = quantity ?? 0;
    if (count <= 0) return undefined;
    return count === 1 ? serving.label : `${formatAmount(count, 2)} × ${serving.label}`;
  }, [mode, serving, quantity]);

  const canAdd = grams !== null && grams > 0;

  /**
   * One sentence that always agrees with the chips and both fields, so a typed
   * weight can never look as though it contradicts the selected serving.
   */
  const portionSummary = useMemo(() => {
    if (!canAdd || grams === null) return t('meals:portionPick');
    const weight = labels.weight(grams, liquid);
    if (!savedLabel || !serving) return weight;
    const shown = labels.portion(serving.label, serving.grams, liquid);
    if (quantity === 1) return shown;
    return `${formatAmount(quantity ?? 0, 2)} × ${shown} · ${weight}`;
  }, [canAdd, grams, liquid, savedLabel, serving, quantity, labels, t]);

  const handleAdd = useCallback(() => {
    if (!food || grams === null || grams <= 0) return;
    const entry = entryFromFood(food, grams, savedLabel);
    onAdd(custom ? { ...entry, source: 'custom' } : entry);
    onClose();
  }, [food, grams, savedLabel, onAdd, custom, onClose]);

  if (!food) return null;

  const macroColumns: { key: string; label: string; value: number; color: string }[] = [
    { key: 'protein', label: t('macros:protein'), value: macros.protein, color: colors.protein },
    { key: 'carbs', label: t('macros:carbs'), value: macros.carbs, color: colors.carbs },
    { key: 'fat', label: t('macros:fat'), value: macros.fat, color: colors.fat },
  ];
  if (macros.fiber !== undefined) {
    macroColumns.push({
      key: 'fiber',
      label: t('macros:fiber'),
      value: macros.fiber,
      color: colors.textMuted,
    });
  }

  const subtitleParts = [
    labels.secondaryName(food),
    food.brand,
    labels.category(food.category),
  ].filter((part): part is string => Boolean(part));

  const summaryLabel = canAdd
    ? t('meals:portionSpoken', {
        portion: portionSummary,
        value: formatCount(Math.round(macros.calories)),
        macros: labels.macroSpoken(macros),
      })
    : t('meals:portionNoneSpoken');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.fill}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('meals:portionClose')}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.anchor}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                paddingBottom: Math.max(insets.bottom, spacing.lg),
              },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            <View style={styles.header}>
              <View style={styles.headerText}>
                <Txt variant="heading" numberOfLines={2}>
                  {labels.name(food)}
                </Txt>
                {subtitleParts.length > 0 ? (
                  <Txt variant="caption" color="faint" numberOfLines={1} style={styles.headerMeta}>
                    {subtitleParts.join(' · ')}
                  </Txt>
                ) : null}
              </View>
              <IconButton
                icon="close"
                onPress={onClose}
                accessibilityLabel={t('meals:portionClose')}
                variant="surface"
                size={18}
              />
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Txt variant="caption" color="faint" weight="semibold" style={styles.sectionLabel}>
                {servings.length === 1 ? t('meals:portionOne') : t('meals:portionChoose')}
              </Txt>
              <View style={styles.chips}>
                {servings.map((option, index) => (
                  <Chip
                    key={`${option.label}-${option.grams}`}
                    label={labels.portion(option.label, option.grams, liquid)}
                    selected={index === servingIndex}
                    onPress={() => selectServing(index)}
                  />
                ))}
              </View>

              <Txt variant="caption" color="faint" weight="semibold" style={styles.sectionLabelTop}>
                {t('meals:portionHowMany')}
              </Txt>
              <View style={styles.chips}>
                {QUANTITY_STEPS.map((step) => (
                  <Chip
                    key={step}
                    label={`${formatAmount(step, 2)}×`}
                    selected={mode === 'serving' && quantity === step}
                    onPress={() => changeQuantity(step)}
                  />
                ))}
              </View>

              <View style={styles.fields}>
                <NumberField
                  label={t('meals:portionServings')}
                  value={quantity}
                  onChange={changeQuantity}
                  suffix="×"
                  placeholder="1"
                  min={0}
                  max={99}
                  style={styles.field}
                />
                <NumberField
                  label={liquid ? t('meals:portionVolume') : t('meals:portionWeight')}
                  value={grams}
                  onChange={changeGrams}
                  suffix={liquid ? t('meals:unitMillilitre') : t('units:gram')}
                  placeholder="0"
                  min={0}
                  max={5000}
                  style={styles.field}
                />
              </View>

              <View
                style={[styles.summary, { backgroundColor: colors.surfaceAlt }]}
                accessible
                accessibilityLabel={summaryLabel}
              >
                <Txt
                  variant="caption"
                  color={canAdd ? 'muted' : 'faint'}
                  weight="medium"
                  numberOfLines={2}
                >
                  {portionSummary}
                </Txt>

                <View style={styles.summaryEnergy}>
                  <Txt variant="title" tabular>
                    {formatCount(Math.round(macros.calories))}
                  </Txt>
                  <Txt variant="label" color="muted" style={styles.summaryUnit}>
                    {t('units:kcal')}
                  </Txt>
                </View>

                <Divider style={styles.summaryRule} />

                <View style={styles.summaryMacros}>
                  {macroColumns.map((column) => (
                    <View key={column.key} style={styles.summaryColumn}>
                      <Txt variant="label" weight="bold" color={column.color} tabular>
                        {formatAmount(column.value, 1)}
                        <Txt variant="caption" color="faint">
                          {` ${t('units:gram')}`}
                        </Txt>
                      </Txt>
                      <Txt variant="caption" color="faint">
                        {column.label}
                      </Txt>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>

            <Button
              label={t('meals:portionAdd')}
              icon="add"
              onPress={handleAdd}
              disabled={!canAdd}
              accessibilityHint={canAdd ? t('meals:portionAddHint') : undefined}
              fullWidth
              size="lg"
              style={styles.add}
            />

            {!canAdd ? (
              <Txt variant="caption" color="faint" align="center" style={styles.addHint}>
                {liquid ? t('meals:portionNeedVolume') : t('meals:portionNeedWeight')}
              </Txt>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  anchor: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: '90%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing.md,
    width: 40,
  },
  header: {
    alignItems: 'flex-start',
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  headerText: {
    flex: 1,
    paddingTop: spacing.xs,
  },
  headerMeta: {
    marginTop: 3,
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyContent: {
    paddingBottom: spacing.lg,
    paddingTop: spacing.lg,
  },
  sectionLabel: {
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  sectionLabelTop: {
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  chips: {
    columnGap: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
  },
  fields: {
    columnGap: spacing.md,
    flexDirection: 'row',
    marginTop: spacing.xl,
  },
  field: {
    flex: 1,
  },
  summary: {
    borderRadius: radius.lg,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  summaryEnergy: {
    alignItems: 'baseline',
    columnGap: spacing.xs,
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  summaryUnit: {
    marginStart: 2,
  },
  summaryRule: {
    marginTop: spacing.md,
  },
  summaryMacros: {
    columnGap: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    rowGap: spacing.sm,
  },
  summaryColumn: {
    minWidth: 60,
  },
  add: {
    marginTop: spacing.sm,
  },
  addHint: {
    marginTop: spacing.sm,
  },
});
