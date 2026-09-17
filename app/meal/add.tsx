import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { CATEGORY_LABELS } from '@/data/foods';
import { currentSlot, formatDayLabel, todayKey } from '@/domain/date';
import { makeId } from '@/domain/id';
import { sumMacros } from '@/domain/nutrition';
import { MEAL_SLOTS, SLOT_LABELS } from '@/domain/totals';
import { useApp } from '@/state/AppStore';
import { spacing, useTheme } from '@/theme';
import type { FoodCategory, FoodItem, Meal, MealEntry, MealSlot } from '@/types';

import { formatCount } from '../onboarding/_layout';

const SEARCH_DEBOUNCE_MS = 120;
const RESULT_LIMIT = 40;
const DRAFT_MAX_HEIGHT = 178;

/** Decoration only: the surrounding control already carries the label. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

type CategoryFilter = FoodCategory | 'all';

const CATEGORY_FILTERS: CategoryFilter[] = [
  'all',
  ...(Object.keys(CATEGORY_LABELS) as FoodCategory[]),
];

const SLOT_OPTIONS: SegmentedOption<MealSlot>[] = MEAL_SLOTS.map((slot) => ({
  value: slot,
  label: SLOT_LABELS[slot],
}));

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
      setError('Could not save this meal. Please try again.');
    }
  }, [entries, saving, date, slot, addMeal, goBack]);

  const trimmedQuery = debouncedQuery.trim();
  const itemWord = entries.length === 1 ? 'item' : 'items';
  const listHeader = trimmedQuery
    ? `${results.length} ${results.length === 1 ? 'RESULT' : 'RESULTS'}`
    : category === 'all'
      ? 'SUGGESTIONS'
      : `${CATEGORY_LABELS[category].toUpperCase()}`;

  return (
    <Screen padded={false} keyboardAvoiding>
      <View style={styles.top}>
        <AppHeader title="Log a meal" subtitle={formatDayLabel(date)} onBack={goBack} />

        <SegmentedControl<MealSlot> options={SLOT_OPTIONS} value={slot} onChange={setSlot} />

        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search foods, dishes, brands"
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
            label={value === 'all' ? 'All' : CATEGORY_LABELS[value]}
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
            title={trimmedQuery ? 'No match found' : 'Nothing in this category'}
            message={
              trimmedQuery
                ? `Nothing in the database matches “${trimmedQuery}”. Add it once with your own numbers and it stays searchable.`
                : 'Search by name in English or Arabic, or pick another category.'
            }
            actionLabel={trimmedQuery ? `Create “${trimmedQuery}”` : 'Create a custom food'}
            onAction={openCustomFood}
            style={styles.empty}
          />
        }
        ListFooterComponent={
          results.length > 0 ? (
            <Card padded={false} style={styles.customCard}>
              <ListRow
                title="Create custom food"
                subtitle={
                  trimmedQuery
                    ? `Add “${trimmedQuery}” with your own numbers`
                    : 'Add something the database does not have'
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
              IN THIS MEAL
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
                ? 'No foods added yet'
                : `${entries.length} ${itemWord}, ${totalCalories} kilocalories. ${
                    draftOpen ? 'Hide' : 'Show'
                  } the list`
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
                kcal
              </Txt>
            </View>
            <View style={styles.summaryMeta}>
              <Txt variant="label" color="muted" numberOfLines={1}>
                {entries.length === 0
                  ? 'Pick a food to start'
                  : `${entries.length} ${itemWord}`}
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
            label="Save meal"
            icon="checkmark"
            onPress={() => void save()}
            disabled={entries.length === 0}
            loading={saving}
            accessibilityHint={`Logs these foods as ${SLOT_LABELS[slot].toLowerCase()} on ${formatDayLabel(date)}`}
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
    marginLeft: 1,
  },
  summaryMeta: {
    alignItems: 'center',
    columnGap: spacing.xs,
    flexDirection: 'row',
    marginTop: 2,
  },
});
