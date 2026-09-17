import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppHeader,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  IconButton,
  ListRow,
  LoadingView,
  MacroBar,
  NumberField,
  Screen,
  SegmentedControl,
  TextField,
  Txt,
} from '@/components/ui';
import { defaultServing, entryFromFood, searchFoods } from '@/data/foodSearch';
import {
  addDays,
  formatDayLabel,
  formatShortDay,
  formatTime,
  todayKey,
} from '@/domain/date';
import { macrosForGrams, sumMacros } from '@/domain/nutrition';
import { MEAL_SLOTS, SLOT_LABELS } from '@/domain/totals';
import { useApp } from '@/state/AppStore';
import { findMeal } from '@/storage/repository';
import { radius, spacing, useTheme } from '@/theme';
import type { FoodItem, Meal, MealEntry, MealSlot } from '@/types';

import { formatCount } from '../onboarding/_layout';

const MAX_ENTRY_GRAMS = 5000;
const NOTE_LIMIT = 280;
const SEARCH_RESULT_LIMIT = 6;

const SLOT_OPTIONS = MEAL_SLOTS.map((slot) => ({
  value: slot,
  label: SLOT_LABELS[slot],
}));

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

/**
 * Re-scales a line proportionally from what it already holds, so a photo
 * estimate or a custom food keeps its own nutrient density.
 */
function scaleEntry(entry: MealEntry, grams: number): MealEntry {
  const quantityGrams = Math.max(0, Math.round(grams * 10) / 10);
  if (entry.quantityGrams <= 0) return { ...entry, quantityGrams };
  const factor = quantityGrams / entry.quantityGrams;
  return { ...entry, quantityGrams, macros: macrosForGrams(entry.macros, factor * 100) };
}

function sameEntry(a: MealEntry, b: MealEntry): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.quantityGrams === b.quantityGrams &&
    a.macros.calories === b.macros.calories &&
    a.macros.protein === b.macros.protein &&
    a.macros.carbs === b.macros.carbs &&
    a.macros.fat === b.macros.fat
  );
}

function entrySubtitle(entry: MealEntry): string {
  const { macros } = entry;
  const weight = `${formatCount(round(entry.quantityGrams))} g`;
  const portion = entry.servingLabel ? `${entry.servingLabel} · ${weight}` : weight;
  return (
    `${portion} · P ${formatCount(round(macros.protein))}` +
    ` · C ${formatCount(round(macros.carbs))} · F ${formatCount(round(macros.fat))}`
  );
}

function confidenceTone(confidence: number): 'success' | 'warning' | 'default' {
  if (confidence >= 0.8) return 'success';
  if (confidence >= 0.5) return 'default';
  return 'warning';
}

/** Alert is a no-op on react-native-web, so the browser gets its own confirm. */
function confirmAction(options: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}): void {
  if (Platform.OS === 'web') {
    const canAsk = typeof window !== 'undefined' && typeof window.confirm === 'function';
    if (!canAsk || window.confirm(`${options.title}\n\n${options.message}`)) {
      options.onConfirm();
    }
    return;
  }
  Alert.alert(options.title, options.message, [
    { text: 'Cancel', style: 'cancel' },
    { text: options.confirmLabel, style: 'destructive', onPress: options.onConfirm },
  ]);
}

interface EditorState {
  entryId: string;
  grams: number | null;
}

export default function MealDetailScreen() {
  const params = useLocalSearchParams();
  const mealId = firstParam(params.id) ?? '';

  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    meals,
    customFoods,
    targets,
    updateMeal,
    deleteMeal,
    setSelectedDate,
  } = useApp();

  const [original, setOriginal] = useState<Meal | null>(null);
  const [loading, setLoading] = useState(true);
  const [slot, setSlot] = useState<MealSlot>('breakfast');
  const [date, setDate] = useState<string>(todayKey());
  const [note, setNote] = useState('');
  const [entries, setEntries] = useState<MealEntry[]>([]);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadedId = useRef<string | null>(null);
  const today = useMemo(() => todayKey(), []);

  const applyMeal = useCallback((meal: Meal) => {
    setOriginal(meal);
    setSlot(meal.slot);
    setDate(meal.date);
    setNote(meal.note ?? '');
    setEntries(meal.entries);
  }, []);

  useEffect(() => {
    if (loadedId.current === mealId) return;

    if (!mealId) {
      loadedId.current = '';
      setLoading(false);
      return;
    }

    const fromStore = meals.find((item) => item.id === mealId);
    if (fromStore) {
      loadedId.current = mealId;
      applyMeal(fromStore);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    findMeal(mealId)
      .then((found) => {
        if (!active) return;
        loadedId.current = mealId;
        if (found) applyMeal(found);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        loadedId.current = mealId;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [mealId, meals, applyMeal]);

  const totals = useMemo(
    () => sumMacros(entries.map((entry) => entry.macros)),
    [entries],
  );

  const dirty = useMemo(() => {
    if (!original) return false;
    if (slot !== original.slot) return true;
    if (date !== original.date) return true;
    if (note.trim() !== (original.note ?? '')) return true;
    if (entries.length !== original.entries.length) return true;
    return entries.some((entry, index) => !sameEntry(entry, original.entries[index]));
  }, [original, slot, date, note, entries]);

  const results = useMemo(
    () =>
      searchOpen
        ? searchFoods(query, { limit: SEARCH_RESULT_LIMIT, extra: customFoods })
        : [],
    [searchOpen, query, customFoods],
  );

  const editorEntry = useMemo(
    () => (editor ? entries.find((entry) => entry.id === editor.entryId) ?? null : null),
    [editor, entries],
  );

  const editorPreview = useMemo(() => {
    if (!editorEntry) return null;
    const grams = editor?.grams;
    if (grams === null || grams === undefined || grams <= 0) return null;
    return scaleEntry(editorEntry, grams).macros;
  }, [editorEntry, editor]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const handleBack = useCallback(() => {
    if (!dirty) {
      goBack();
      return;
    }
    confirmAction({
      title: 'Discard changes?',
      message: 'Your edits to this meal have not been saved yet.',
      confirmLabel: 'Discard',
      onConfirm: goBack,
    });
  }, [dirty, goBack]);

  const markEdited = useCallback(() => {
    setSaved(false);
    setError(null);
  }, []);

  const handleSlot = useCallback(
    (next: MealSlot) => {
      markEdited();
      setSlot(next);
    },
    [markEdited],
  );

  const shiftDate = useCallback(
    (days: number) => {
      markEdited();
      setDate((current) => addDays(current, days));
    },
    [markEdited],
  );

  const handleNote = useCallback(
    (next: string) => {
      markEdited();
      setNote(next);
    },
    [markEdited],
  );

  const openEditor = useCallback((entry: MealEntry) => {
    setEditor({ entryId: entry.id, grams: entry.quantityGrams });
  }, []);

  const applyEditor = useCallback(() => {
    const grams = editor?.grams;
    if (!editorEntry || grams === null || grams === undefined || grams <= 0) return;
    markEdited();
    setEntries((current) =>
      current.map((entry) => (entry.id === editorEntry.id ? scaleEntry(entry, grams) : entry)),
    );
    setEditor(null);
  }, [editor, editorEntry, markEdited]);

  const removeEditorEntry = useCallback(() => {
    if (!editorEntry) return;
    markEdited();
    setEntries((current) => current.filter((entry) => entry.id !== editorEntry.id));
    setEditor(null);
  }, [editorEntry, markEdited]);

  const addFood = useCallback(
    (food: FoodItem) => {
      const serving = defaultServing(food);
      markEdited();
      setEntries((current) => [...current, entryFromFood(food, serving.grams, serving.label)]);
      setQuery('');
      setSearchOpen(false);
    },
    [markEdited],
  );

  const handleSave = useCallback(async () => {
    if (!original || saving || !dirty || entries.length === 0) return;

    const trimmed = note.trim();
    const next: Meal = { ...original, slot, date, entries };
    if (trimmed.length > 0) next.note = trimmed;
    else delete next.note;

    setSaving(true);
    setError(null);
    try {
      await updateMeal(next, original.date);
      if (next.date !== original.date) setSelectedDate(next.date);
      setOriginal(next);
      setSaved(true);
    } catch {
      setError('Could not save this meal. Try again.');
    } finally {
      setSaving(false);
    }
  }, [original, saving, dirty, entries, note, slot, date, updateMeal, setSelectedDate]);

  const handleDelete = useCallback(() => {
    if (!original) return;
    confirmAction({
      title: 'Delete meal?',
      message: `${SLOT_LABELS[original.slot]} on ${formatDayLabel(original.date, today)} will be removed from your log.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        void deleteMeal(original.date, original.id)
          .then(() => goBack())
          .catch(() => setError('Could not delete this meal. Try again.'));
      },
    });
  }, [original, today, deleteMeal, goBack]);

  if (loading) {
    return (
      <Screen>
        <AppHeader title="Meal" onBack={goBack} />
        <LoadingView message="Loading meal" />
      </Screen>
    );
  }

  if (!original) {
    return (
      <Screen>
        <AppHeader title="Meal" onBack={goBack} />
        <EmptyState
          icon="help-circle-outline"
          title="Meal not found"
          message="This meal is no longer in your log. It may have been deleted on another screen."
          actionLabel="Go back"
          onAction={goBack}
        />
      </Screen>
    );
  }

  const photoUri = original.photoUri;
  const loggedTime = formatTime(original.loggedAt);
  const canSave = dirty && entries.length > 0;

  return (
    <Screen scroll keyboardAvoiding edges={['top', 'bottom']}>
      <AppHeader
        title={SLOT_LABELS[slot]}
        subtitle={
          loggedTime
            ? `${formatDayLabel(date, today)} · logged ${loggedTime}`
            : formatDayLabel(date, today)
        }
        onBack={handleBack}
        right={dirty ? <Badge label="Unsaved" tone="warning" /> : undefined}
      />

      {photoUri ? (
        <Pressable
          onPress={() => setPhotoOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open the meal photo full screen"
          style={({ pressed }) => [
            styles.photoWrap,
            { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
            pressed ? styles.pressed : null,
          ]}
        >
          <Image
            source={{ uri: photoUri }}
            style={styles.photo}
            contentFit="cover"
            transition={160}
            accessibilityLabel="Meal photo"
          />
          <View style={styles.photoCorner} pointerEvents="none">
            <Chip label="Tap to enlarge" icon="expand-outline" />
          </View>
        </Pressable>
      ) : null}

      <Card style={styles.block}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryHeadline}>
            <Txt variant="caption" color="faint" weight="semibold">
              MEAL TOTAL
            </Txt>
            <View style={styles.calorieRow}>
              <Txt variant="title" tabular>
                {formatCount(round(totals.calories))}
              </Txt>
              <Txt variant="label" color="faint" weight="medium" style={styles.calorieUnit}>
                kcal
              </Txt>
            </View>
          </View>
          <Badge label={entries.length === 1 ? '1 item' : `${entries.length} items`} />
        </View>

        {targets ? (
          <View style={styles.bars}>
            <MacroBar
              label="Protein"
              value={totals.protein}
              target={targets.protein}
              color={colors.protein}
            />
            <MacroBar
              label="Carbs"
              value={totals.carbs}
              target={targets.carbs}
              color={colors.carbs}
            />
            <MacroBar label="Fat" value={totals.fat} target={targets.fat} color={colors.fat} />
            <Txt variant="caption" color="faint">
              Measured against your daily targets.
            </Txt>
          </View>
        ) : (
          <View style={styles.macroRow}>
            {(
              [
                ['Protein', totals.protein, colors.protein],
                ['Carbs', totals.carbs, colors.carbs],
                ['Fat', totals.fat, colors.fat],
              ] as const
            ).map(([label, value, color]) => (
              <View key={label} style={styles.macroCell}>
                <Txt variant="caption" color="faint" weight="semibold">
                  {label.toUpperCase()}
                </Txt>
                <Txt variant="heading" weight="bold" color={color} tabular>
                  {formatCount(round(value))}
                  <Txt variant="label" color="faint">
                    {' g'}
                  </Txt>
                </Txt>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Txt variant="caption" color="faint" weight="semibold" style={styles.sectionTitle}>
        WHEN
      </Txt>

      <Card style={styles.block}>
        <Txt variant="label" color="muted" weight="medium" style={styles.fieldLabel}>
          Meal
        </Txt>
        <SegmentedControl options={SLOT_OPTIONS} value={slot} onChange={handleSlot} />

        <Txt variant="label" color="muted" weight="medium" style={styles.fieldLabelSpaced}>
          Day
        </Txt>
        <View style={[styles.dateRow, { borderColor: colors.border }]}>
          <IconButton
            icon="chevron-back"
            variant="surface"
            size={18}
            onPress={() => shiftDate(-1)}
            accessibilityLabel="Move this meal to the previous day"
          />
          <View style={styles.dateLabel}>
            <Txt weight="semibold" align="center" numberOfLines={1}>
              {formatDayLabel(date, today)}
            </Txt>
            <Txt variant="caption" color="faint" align="center">
              {formatShortDay(date)}
            </Txt>
          </View>
          <IconButton
            icon="chevron-forward"
            variant="surface"
            size={18}
            disabled={date >= today}
            onPress={() => shiftDate(1)}
            accessibilityLabel="Move this meal to the next day"
          />
        </View>
      </Card>

      <Txt variant="caption" color="faint" weight="semibold" style={styles.sectionTitle}>
        FOODS
      </Txt>

      <Card padded={false} style={styles.block}>
        {entries.length === 0 ? (
          <View style={styles.emptyEntries}>
            <Txt color="muted" align="center">
              No foods left in this meal. Add one below, or delete the meal.
            </Txt>
          </View>
        ) : (
          entries.map((entry, index) => (
            <React.Fragment key={entry.id}>
              {index > 0 ? <Divider inset /> : null}
              <ListRow
                title={entry.name}
                subtitle={entrySubtitle(entry)}
                onPress={() => openEditor(entry)}
                chevron
                right={
                  <View style={styles.entryRight}>
                    {entry.source === 'photo' && entry.confidence !== undefined ? (
                      <Badge
                        label={`${Math.round(entry.confidence * 100)}%`}
                        tone={confidenceTone(entry.confidence)}
                      />
                    ) : null}
                    <View style={styles.entryEnergy}>
                      <Txt variant="label" weight="bold" tabular>
                        {formatCount(round(entry.macros.calories))}
                      </Txt>
                      <Txt variant="caption" color="faint">
                        kcal
                      </Txt>
                    </View>
                  </View>
                }
              />
            </React.Fragment>
          ))
        )}
      </Card>

      {searchOpen ? (
        <Card padded={false} style={styles.block}>
          <View style={styles.searchHead}>
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="Search foods"
              icon="search"
              autoFocus
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>

          {results.length === 0 ? (
            <View style={styles.emptyEntries}>
              <Txt color="muted" align="center">
                Nothing matches that search. Try a shorter word.
              </Txt>
            </View>
          ) : (
            results.map((food, index) => {
              const serving = defaultServing(food);
              const servingMacros = macrosForGrams(food.per100, serving.grams);
              return (
                <React.Fragment key={food.id}>
                  {index > 0 ? <Divider inset /> : null}
                  <ListRow
                    title={food.name}
                    subtitle={`${serving.label} · ${formatCount(round(servingMacros.calories))} kcal`}
                    icon="add"
                    onPress={() => addFood(food)}
                  />
                </React.Fragment>
              );
            })
          )}

          <Divider />
          <View style={styles.searchFoot}>
            <Button
              label="Close search"
              variant="ghost"
              size="sm"
              onPress={() => {
                setSearchOpen(false);
                setQuery('');
              }}
            />
          </View>
        </Card>
      ) : (
        <Button
          label="Add food to this meal"
          icon="add"
          variant="secondary"
          fullWidth
          onPress={() => setSearchOpen(true)}
          style={styles.block}
        />
      )}

      <TextField
        label="Note"
        value={note}
        onChangeText={handleNote}
        placeholder="How it was cooked, how you felt, anything worth remembering"
        multiline
        maxLength={NOTE_LIMIT}
        hint={`${note.length}/${NOTE_LIMIT}`}
        style={styles.block}
      />

      <Button
        label="Save changes"
        icon="checkmark"
        onPress={() => {
          void handleSave();
        }}
        disabled={!canSave}
        loading={saving}
        accessibilityHint={
          canSave ? 'Writes your edits to this meal' : 'Nothing to save at the moment'
        }
        fullWidth
        size="lg"
        style={styles.block}
      />

      {error ? (
        <Txt variant="label" color="danger" align="center" style={styles.status}>
          {error}
        </Txt>
      ) : entries.length === 0 ? (
        <Txt variant="label" color="muted" align="center" style={styles.status}>
          A meal needs at least one food before it can be saved.
        </Txt>
      ) : dirty ? (
        <Txt variant="caption" color="warning" align="center" style={styles.status}>
          You have unsaved changes.
        </Txt>
      ) : saved ? (
        <Txt variant="caption" color="success" align="center" style={styles.status}>
          Changes saved.
        </Txt>
      ) : (
        <Txt variant="caption" color="faint" align="center" style={styles.status}>
          Nothing has changed yet.
        </Txt>
      )}

      <Divider style={styles.deleteRule} />

      <Txt variant="caption" color="faint" align="center" style={styles.deleteNote}>
        Deleting removes this meal and its entries from your log. It cannot be undone.
      </Txt>

      <Button
        label="Delete meal"
        icon="trash-outline"
        variant="danger"
        fullWidth
        onPress={handleDelete}
        accessibilityHint="Asks you to confirm, then removes this meal"
        style={styles.deleteButton}
      />

      <Modal
        visible={editor !== null && editorEntry !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditor(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
            onPress={() => setEditor(null)}
            accessibilityRole="button"
            accessibilityLabel="Close the portion editor"
          />
          {editorEntry ? (
            <View
              style={[
                styles.modalCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.modalHead}>
                <View style={styles.modalTitle}>
                  <Txt variant="heading" numberOfLines={2}>
                    {editorEntry.name}
                  </Txt>
                  {editorEntry.source === 'photo' && editorEntry.confidence !== undefined ? (
                    <Badge
                      label={`${Math.round(editorEntry.confidence * 100)}% confident`}
                      tone={confidenceTone(editorEntry.confidence)}
                      style={styles.modalBadge}
                    />
                  ) : null}
                </View>
                <IconButton
                  icon="close"
                  onPress={() => setEditor(null)}
                  accessibilityLabel="Close the portion editor"
                />
              </View>

              <NumberField
                label="Portion"
                value={editor?.grams ?? null}
                onChange={(grams) =>
                  setEditor((current) => (current ? { ...current, grams } : current))
                }
                suffix="g"
                min={1}
                max={MAX_ENTRY_GRAMS}
                autoFocus
                onSubmitEditing={applyEditor}
                hint={`Was ${formatCount(round(editorEntry.quantityGrams))} g`}
              />

              <View style={[styles.preview, { backgroundColor: colors.surfaceAlt }]}>
                {editorPreview ? (
                  <>
                    <View style={styles.previewRow}>
                      <Txt variant="label" color="muted">
                        Calories
                      </Txt>
                      <Txt variant="label" weight="semibold" tabular>
                        {`${formatCount(round(editorPreview.calories))} kcal`}
                      </Txt>
                    </View>
                    <View style={styles.previewRow}>
                      <Txt variant="label" color="muted">
                        Protein / Carbs / Fat
                      </Txt>
                      <Txt variant="label" weight="semibold" tabular>
                        {`${formatCount(round(editorPreview.protein))} / ${formatCount(round(editorPreview.carbs))} / ${formatCount(round(editorPreview.fat))} g`}
                      </Txt>
                    </View>
                  </>
                ) : (
                  <Txt variant="label" color="muted">
                    Enter a portion above to see the nutrients.
                  </Txt>
                )}
              </View>

              <View style={styles.modalActions}>
                <Button
                  label="Remove"
                  variant="danger"
                  size="sm"
                  icon="trash-outline"
                  onPress={removeEditorEntry}
                />
                <Button
                  label="Update"
                  size="sm"
                  onPress={applyEditor}
                  disabled={editorPreview === null}
                />
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={photoOpen && photoUri !== undefined}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPhotoOpen(false)}
      >
        <View style={[styles.viewer, { backgroundColor: colors.bg }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPhotoOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close the photo"
          />
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={styles.viewerImage}
              contentFit="contain"
              accessibilityLabel="Meal photo"
              pointerEvents="none"
            />
          ) : null}
          <View style={[styles.viewerClose, { top: insets.top + spacing.md }]}>
            <IconButton
              icon="close"
              variant="surface"
              onPress={() => setPhotoOpen(false)}
              accessibilityLabel="Close the photo"
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: spacing.lg,
  },
  pressed: {
    opacity: 0.85,
  },
  photoWrap: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  photo: {
    height: 208,
    width: '100%',
  },
  photoCorner: {
    bottom: spacing.sm,
    position: 'absolute',
    right: spacing.sm,
  },
  summaryTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryHeadline: {
    flexShrink: 1,
  },
  calorieRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  calorieUnit: {
    marginLeft: spacing.xs + 2,
  },
  bars: {
    marginTop: spacing.lg,
    rowGap: spacing.md,
  },
  macroRow: {
    columnGap: spacing.md,
    flexDirection: 'row',
    marginTop: spacing.lg,
  },
  macroCell: {
    flex: 1,
    rowGap: spacing.xs,
  },
  fieldLabel: {
    marginBottom: spacing.sm,
  },
  fieldLabelSpaced: {
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  dateRow: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  dateLabel: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  sectionTitle: {
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  emptyEntries: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  entryRight: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  entryEnergy: {
    alignItems: 'flex-end',
    minWidth: 40,
  },
  searchHead: {
    padding: spacing.lg,
  },
  searchFoot: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  status: {
    marginBottom: spacing.lg,
    marginTop: -spacing.sm,
  },
  deleteRule: {
    marginBottom: spacing.lg,
  },
  deleteNote: {
    marginBottom: spacing.md,
  },
  deleteButton: {
    marginBottom: spacing.xxl,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    alignSelf: 'center',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 440,
    padding: spacing.lg,
    rowGap: spacing.lg,
    width: '100%',
  },
  modalHead: {
    alignItems: 'flex-start',
    columnGap: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalTitle: {
    flex: 1,
    paddingTop: spacing.sm,
  },
  modalBadge: {
    marginTop: spacing.sm,
  },
  preview: {
    borderRadius: radius.md,
    padding: spacing.md,
    rowGap: spacing.sm,
  },
  previewRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalActions: {
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  viewer: {
    flex: 1,
    justifyContent: 'center',
  },
  viewerImage: {
    flex: 1,
    width: '100%',
  },
  viewerClose: {
    position: 'absolute',
    right: spacing.md,
  },
});
