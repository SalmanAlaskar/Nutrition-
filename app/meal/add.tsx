import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type AccessibilityProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryRow } from '@/components/meal/EntryRow';
import { FoodResultRow } from '@/components/meal/FoodResultRow';
import { PortionSheet } from '@/components/meal/PortionSheet';
import { FOOD_CATEGORIES, useFoodLabels } from '@/components/meal/useFoodLabels';
import { useDayLabels } from '@/components/today/useDayLabels';
import {
  AppHeader,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ListRow,
  Screen,
  SegmentedControl,
  TextField,
  Txt,
  type SegmentedOption,
} from '@/components/ui';
import { searchFoods } from '@/data/foodSearch';
import { currentSlot, todayKey } from '@/domain/date';
import { formatCount } from '@/domain/format';
import { makeId } from '@/domain/id';
import { sumMacros } from '@/domain/nutrition';
import { MEAL_SLOTS } from '@/domain/totals';
import { useApp } from '@/state/AppStore';
import { spacing, useTheme } from '@/theme';
import type { FoodCategory, FoodItem, Meal, MealEntry, MealSlot } from '@/types';

const SEARCH_DEBOUNCE_MS = 120;
const RESULT_LIMIT = 40;
const DRAFT_MAX_HEIGHT = 178;

/** Decoration only: the surrounding control already carries the label. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

type CategoryFilter = FoodCategory | 'all';

const CATEGORY_FILTERS: CategoryFilter[] = ['all', ...FOOD_CATEGORIES];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isMealSlot(value: string | undefined): value is MealSlot {
  return value !== undefined && (MEAL_SLOTS as string[]).includes(value);
}

function isDateKey(value: string | undefined): value is string {
  return value !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Search the food database, build a list of portions, save it as one meal. */
export default function AddMealScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useTheme();
  const { t } = useTranslation(['meals', 'units', 'common']);
  const labels = useFoodLabels();
  const dayLabels = useDayLabels();
  const insets = useSafeAreaInsets();
  const { customFoods, addMeal } = useApp();

  const slotParam = firstParam(params.slot);
  const dateParam = firstParam(params.date);
  const date = isDateKey(dateParam) ? dateParam : todayKey();

  const [slot, setSlot] = useState<MealSlot>(() =>
    isMealSlot(slotParam) ? slotParam : currentSlot(),
  );
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [sheetFood, setSheetFood] = useState<FoodItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const results = useMemo(
    () => searchFoods(debouncedQuery, { extra: customFoods, category, limit: RESULT_LIMIT }),
    [debouncedQuery, customFoods, category],
  );

  const customIds = useMemo(
    () => new Set(customFoods.map((food) => food.id)),
    [customFoods],
  );

  const slotOptions = useMemo<SegmentedOption<MealSlot>[]>(
    () => MEAL_SLOTS.map((value) => ({ value, label: labels.slot(value) })),
    [labels],
  );

  const totalCalories = useMemo(
    () => Math.round(sumMacros(entries.map((entry) => entry.macros)).calories),
    [entries],
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const openPortions = useCallback((food: FoodItem) => {
    setSheetFood(food);
    setSheetOpen(true);
  }, []);

  const addEntry = useCallback((entry: MealEntry) => {
    setEntries((current) => [...current, entry]);
    setDraftOpen(true);
    setError(null);
  }, []);

  const removeEntry = useCallback((entryId: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
  }, []);

  const openCustomFood = useCallback(() => {
    router.push({
      pathname: '/meal/custom',
      params: { slot, date, name: query.trim() },
    });
  }, [router, slot, date, query]);

  const save = useCallback(async () => {
    if (entries.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    const meal: Meal = {
      id: makeId('m'),
      date,
      loggedAt: new Date().toISOString(),
      slot,
      entries,
    };
    try {
      await addMeal(meal);
      goBack();
    } catch {
      setSaving(false);
      setError(t('meals:saveMealError'));
    }
  }, [entries, saving, date, slot, addMeal, goBack, t]);

  const trimmedQuery = debouncedQuery.trim();
  const itemsText = labels.items(entries.length);
  const dayLabel = dayLabels.day(date);
  const listHeader = trimmedQuery
    ? results.length === 1
      ? t('meals:resultsOne')
      : t('meals:resultsOther', { value: formatCount(results.length) })
    : category === 'all'
      ? t('meals:suggestions')
      : labels.category(category);

  return (
    <Screen padded={false} keyboardAvoiding>
      <View style={styles.top}>
        <AppHeader title={t('meals:addTitle')} subtitle={dayLabel} onBack={goBack} />

        <SegmentedControl<MealSlot> options={slotOptions} value={slot} onChange={setSlot} />

        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={t('meals:searchPlaceholder')}
          icon="search"
          autoFocus
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.search}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.filterStrip}
        contentContainerStyle={styles.filters}
      >
        {CATEGORY_FILTERS.map((value) => (
          <Chip
            key={value}
            label={value === 'all' ? t('meals:categoryAll') : labels.category(value)}
            selected={category === value}
            onPress={() => setCategory(value)}
          />
        ))}
      </ScrollView>

      <FlatList
        data={results}
        style={styles.list}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <Divider inset />}
        ListHeaderComponent={
          results.length > 0 ? (
            <Txt variant="caption" color="faint" weight="semibold" style={styles.listLabel}>
              {listHeader}
            </Txt>
          ) : null
        }
        renderItem={({ item }) => (
          <FoodResultRow food={item} onPress={openPortions} custom={customIds.has(item.id)} />
        )}
        ListEmptyComponent={
          <EmptyState
            icon={trimmedQuery ? 'search-outline' : 'filter-outline'}
            title={trimmedQuery ? t('meals:noMatchTitle') : t('meals:emptyCategoryTitle')}
            message={
              trimmedQuery
                ? t('meals:noMatchBody', { query: trimmedQuery })
                : t('meals:emptyCategoryBody')
            }
            actionLabel={
              trimmedQuery
                ? t('meals:createNamed', { query: trimmedQuery })
                : t('meals:createCustom')
            }
            onAction={openCustomFood}
            style={styles.empty}
          />
        }
        ListFooterComponent={
          results.length > 0 ? (
            <Card padded={false} style={styles.customCard}>
              <ListRow
                title={t('meals:createCustom')}
                subtitle={
                  trimmedQuery
                    ? t('meals:customRowNamed', { query: trimmedQuery })
                    : t('meals:customRowBody')
                }
                icon="add-circle-outline"
                onPress={openCustomFood}
                chevron
              />
            </Card>
          ) : null
        }
      />

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
        {entries.length > 0 && draftOpen ? (
          <>
            <Txt variant="caption" color="faint" weight="semibold" style={styles.draftLabel}>
              {t('meals:draftTitle')}
            </Txt>
            <ScrollView
              style={styles.draft}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {entries.map((entry, index) => (
                <View key={entry.id}>
                  {index > 0 ? <Divider inset /> : null}
                  <EntryRow entry={entry} onRemove={() => removeEntry(entry.id)} />
                </View>
              ))}
            </ScrollView>
            <Divider />
          </>
        ) : null}

        {error ? (
          <Txt variant="caption" color="danger" style={styles.error}>
            {error}
          </Txt>
        ) : null}

        <View style={styles.footerBar}>
          <Pressable
            onPress={() => setDraftOpen((open) => !open)}
            disabled={entries.length === 0}
            accessibilityRole="button"
            accessibilityLabel={
              entries.length === 0
                ? t('meals:draftEmptySpoken')
                : t('meals:draftSpoken', {
                    items: itemsText,
                    value: formatCount(totalCalories),
                  })
            }
            accessibilityHint={
              entries.length === 0
                ? undefined
                : draftOpen
                  ? t('meals:draftHide')
                  : t('meals:draftShow')
            }
            accessibilityState={{ expanded: draftOpen, disabled: entries.length === 0 }}
            style={({ pressed }) => [
              styles.summary,
              pressed && entries.length > 0 ? styles.summaryPressed : null,
            ]}
          >
            <View style={styles.summaryValue}>
              <Txt
                variant="heading"
                color={entries.length === 0 ? 'faint' : 'text'}
                tabular
                numberOfLines={1}
              >
                {formatCount(totalCalories)}
              </Txt>
              <Txt variant="label" color="faint" weight="medium" style={styles.summaryUnit}>
                {t('units:kcal')}
              </Txt>
            </View>
            <View style={styles.summaryMeta}>
              <Txt variant="label" color="muted" numberOfLines={1}>
                {entries.length === 0 ? t('meals:pickFoodToStart') : itemsText}
              </Txt>
              {entries.length > 0 ? (
                <Ionicons
                  name={draftOpen ? 'chevron-down' : 'chevron-up'}
                  size={14}
                  color={colors.textFaint}
                  {...DECORATIVE}
                />
              ) : null}
            </View>
          </Pressable>

          <Button
            label={t('meals:saveMeal')}
            icon="checkmark"
            onPress={() => void save()}
            disabled={entries.length === 0}
            loading={saving}
            accessibilityHint={t('meals:saveMealHint', {
              slot: labels.slot(slot),
              day: dayLabel,
            })}
          />
        </View>
      </View>

      <PortionSheet
        food={sheetFood}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onAdd={addEntry}
        custom={sheetFood ? customIds.has(sheetFood.id) : false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    paddingHorizontal: spacing.lg,
  },
  search: {
    marginTop: spacing.md,
  },
  filterStrip: {
    flexGrow: 0,
    marginTop: spacing.md,
  },
  filters: {
    columnGap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  list: {
    flex: 1,
    marginTop: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  listLabel: {
    letterSpacing: 0.8,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  empty: {
    paddingTop: spacing.xl,
  },
  customCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  draftLabel: {
    letterSpacing: 0.8,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  draft: {
    maxHeight: DRAFT_MAX_HEIGHT,
  },
  error: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  footerBar: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  summary: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  summaryPressed: {
    opacity: 0.6,
  },
  summaryValue: {
    alignItems: 'baseline',
    columnGap: spacing.xs,
    flexDirection: 'row',
  },
  summaryUnit: {
    marginStart: 1,
  },
  summaryMeta: {
    alignItems: 'center',
    columnGap: spacing.xs,
    flexDirection: 'row',
    marginTop: 2,
  },
});
