import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

import { useFoodLabels } from '@/components/meal/useFoodLabels';
import { useDayLabels } from '@/components/today/useDayLabels';
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
import { addDays, todayKey } from '@/domain/date';
import { formatCount } from '@/domain/format';
import { macrosForGrams, sumMacros } from '@/domain/nutrition';
import { MEAL_SLOTS } from '@/domain/totals';
import { useApp } from '@/state/AppStore';
import { findMeal } from '@/storage/repository';
import { radius, spacing, useTheme } from '@/theme';
import type { FoodItem, Meal, MealEntry, MealSlot } from '@/types';

const MAX_ENTRY_GRAMS = 5000;
const NOTE_LIMIT = 280;
const SEARCH_RESULT_LIMIT = 6;

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
  cancelLabel: string;
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
    { text: options.cancelLabel, style: 'cancel' },
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
  const { t } = useTranslation(['meals', 'macros', 'units', 'common']);
  const labels = useFoodLabels();
  const dayLabels = useDayLabels();
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

  const slotOptions = useMemo(
    () => MEAL_SLOTS.map((value) => ({ value, label: labels.slot(value) })),
    [labels],
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
      title: t('meals:detailDiscardTitle'),
      message: t('meals:detailDiscardBody'),
      confirmLabel: t('meals:detailDiscardAction'),
      cancelLabel: t('common:cancel'),
      onConfirm: goBack,
    });
  }, [dirty, goBack, t]);

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
      setError(t('meals:detailSaveError'));
    } finally {
      setSaving(false);
    }
  }, [original, saving, dirty, entries, note, slot, date, updateMeal, setSelectedDate, t]);

  const handleDelete = useCallback(() => {
    if (!original) return;
    confirmAction({
      title: t('meals:detailDeleteTitle'),
      message: t('meals:detailDeleteBody', {
        slot: labels.slot(original.slot),
        day: dayLabels.day(original.date, today),
      }),
      confirmLabel: t('common:delete'),
      cancelLabel: t('common:cancel'),
      onConfirm: () => {
        void deleteMeal(original.date, original.id)
          .then(() => goBack())
          .catch(() => setError(t('meals:detailDeleteError')));
      },
    });
  }, [original, today, deleteMeal, goBack, labels, dayLabels, t]);

  if (loading) {
    return (
      <Screen>
        <AppHeader title={t('meals:detailTitle')} onBack={goBack} />
        <LoadingView message={t('meals:detailLoading')} />
      </Screen>
    );
  }

  if (!original) {
    return (
      <Screen>
        <AppHeader title={t('meals:detailTitle')} onBack={goBack} />
        <EmptyState
          icon="help-circle-outline"
          title={t('meals:detailNotFoundTitle')}
          message={t('meals:detailNotFoundBody')}
          actionLabel={t('meals:detailGoBack')}
          onAction={goBack}
        />
      </Screen>
    );
  }

  const photoUri = original.photoUri;
  const loggedTime = dayLabels.time(original.loggedAt);
  const dayLabel = dayLabels.day(date, today);
  const canSave = dirty && entries.length > 0;

  return (
    <Screen scroll keyboardAvoiding edges={['top', 'bottom']}>
      <AppHeader
        title={labels.slot(slot)}
        subtitle={
          loggedTime
            ? t('meals:detailLoggedAt', { day: dayLabel, time: loggedTime })
            : dayLabel
        }
        onBack={handleBack}
        right={dirty ? <Badge label={t('meals:detailUnsavedBadge')} tone="warning" /> : undefined}
      />

      {photoUri ? (
        <Pressable
          onPress={() => setPhotoOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('meals:detailOpenPhoto')}
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
            accessibilityLabel={t('meals:detailPhotoAlt')}
          />
          <View style={styles.photoCorner} pointerEvents="none">
            <Chip label={t('meals:detailEnlarge')} icon="expand-outline" />
          </View>
        </Pressable>
      ) : null}

      <Card style={styles.block}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryHeadline}>
            <Txt variant="caption" color="faint" weight="semibold">
              {t('meals:detailTotal')}
            </Txt>
            <View style={styles.calorieRow}>
              <Txt variant="title" tabular>
                {formatCount(round(totals.calories))}
              </Txt>
              <Txt variant="label" color="faint" weight="medium" style={styles.calorieUnit}>
                {t('units:kcal')}
              </Txt>
            </View>
          </View>
          <Badge label={labels.items(entries.length)} />
        </View>

        {targets ? (
          <View style={styles.bars}>
            <MacroBar
              label={t('macros:protein')}
              value={totals.protein}
              target={targets.protein}
              color={colors.protein}
            />
            <MacroBar
              label={t('macros:carbs')}
              value={totals.carbs}
              target={targets.carbs}
              color={colors.carbs}
            />
            <MacroBar
              label={t('macros:fat')}
              value={totals.fat}
              target={targets.fat}
              color={colors.fat}
            />
            <Txt variant="caption" color="faint">
              {t('meals:detailAgainstTargets')}
            </Txt>
          </View>
        ) : (
          <View style={styles.macroRow}>
            {(
              [
                ['protein', t('macros:protein'), totals.protein, colors.protein],
                ['carbs', t('macros:carbs'), totals.carbs, colors.carbs],
                ['fat', t('macros:fat'), totals.fat, colors.fat],
              ] as const
            ).map(([key, label, value, color]) => (
              <View key={key} style={styles.macroCell}>
                <Txt variant="caption" color="faint" weight="semibold" numberOfLines={1}>
                  {label}
                </Txt>
                <Txt variant="heading" weight="bold" color={color} tabular>
                  {formatCount(round(value))}
                  <Txt variant="label" color="faint">
                    {` ${t('units:gram')}`}
                  </Txt>
                </Txt>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Txt variant="caption" color="faint" weight="semibold" style={styles.sectionTitle}>
        {t('meals:detailWhen')}
      </Txt>

      <Card style={styles.block}>
        <Txt variant="label" color="muted" weight="medium" style={styles.fieldLabel}>
          {t('meals:detailSlotField')}
        </Txt>
        <SegmentedControl options={slotOptions} value={slot} onChange={handleSlot} />

        <Txt variant="label" color="muted" weight="medium" style={styles.fieldLabelSpaced}>
          {t('meals:detailDayField')}
        </Txt>
        <View style={[styles.dateRow, { borderColor: colors.border }]}>
          <IconButton
            icon="chevron-back"
            variant="surface"
            size={18}
            onPress={() => shiftDate(-1)}
            accessibilityLabel={t('meals:detailPrevDay')}
          />
          <View style={styles.dateLabel}>
            <Txt weight="semibold" align="center" numberOfLines={1}>
              {dayLabel}
            </Txt>
            <Txt variant="caption" color="faint" align="center">
              {dayLabels.shortDay(date)}
            </Txt>
          </View>
          <IconButton
            icon="chevron-forward"
            variant="surface"
            size={18}
            disabled={date >= today}
            onPress={() => shiftDate(1)}
            accessibilityLabel={t('meals:detailNextDay')}
          />
        </View>
      </Card>

      <Txt variant="caption" color="faint" weight="semibold" style={styles.sectionTitle}>
        {t('meals:detailFoods')}
      </Txt>

      <Card padded={false} style={styles.block}>
        {entries.length === 0 ? (
          <View style={styles.emptyEntries}>
            <Txt color="muted" align="center">
              {t('meals:detailNoFoods')}
            </Txt>
          </View>
        ) : (
          entries.map((entry, index) => (
            <React.Fragment key={entry.id}>
              {index > 0 ? <Divider inset /> : null}
              <ListRow
                title={entry.name}
                subtitle={`${labels.portion(
                  entry.servingLabel,
                  entry.quantityGrams,
                )} · ${labels.macroLine(entry.macros)}`}
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
                        {t('units:kcal')}
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
              placeholder={t('meals:detailSearchPlaceholder')}
              icon="search"
              autoFocus
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>

          {results.length === 0 ? (
            <View style={styles.emptyEntries}>
              <Txt color="muted" align="center">
                {t('meals:detailNoSearchMatch')}
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
                    title={labels.name(food)}
                    subtitle={`${labels.portion(
                      serving.label,
                      serving.grams,
                      food.liquid,
                    )} · ${formatCount(round(servingMacros.calories))} ${t('units:kcal')}`}
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
              label={t('meals:detailCloseSearch')}
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
          label={t('meals:detailAddFood')}
          icon="add"
          variant="secondary"
          fullWidth
          onPress={() => setSearchOpen(true)}
          style={styles.block}
        />
      )}

      <TextField
        label={t('meals:reviewNote')}
        value={note}
        onChangeText={handleNote}
        placeholder={t('meals:detailNotePlaceholder')}
        multiline
        maxLength={NOTE_LIMIT}
        hint={`${note.length}/${NOTE_LIMIT}`}
        style={styles.block}
      />

      <Button
        label={t('meals:detailSave')}
        icon="checkmark"
        onPress={() => {
          void handleSave();
        }}
        disabled={!canSave}
        loading={saving}
        accessibilityHint={
          canSave ? t('meals:detailSaveHint') : t('meals:detailSaveNothingHint')
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
          {t('meals:detailNeedFood')}
        </Txt>
      ) : dirty ? (
        <Txt variant="caption" color="warning" align="center" style={styles.status}>
          {t('meals:detailUnsaved')}
        </Txt>
      ) : saved ? (
        <Txt variant="caption" color="success" align="center" style={styles.status}>
          {t('meals:detailSaved')}
        </Txt>
      ) : (
        <Txt variant="caption" color="faint" align="center" style={styles.status}>
          {t('meals:detailUnchanged')}
        </Txt>
      )}

      <Divider style={styles.deleteRule} />

      <Txt variant="caption" color="faint" align="center" style={styles.deleteNote}>
        {t('meals:detailDeleteNote')}
      </Txt>

      <Button
        label={t('meals:detailDelete')}
        icon="trash-outline"
        variant="danger"
        fullWidth
        onPress={handleDelete}
        accessibilityHint={t('meals:detailDeleteHint')}
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
            accessibilityLabel={t('meals:detailEditorClose')}
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
                      label={t('meals:detailConfident', {
                        value: formatCount(editorEntry.confidence * 100),
                      })}
                      tone={confidenceTone(editorEntry.confidence)}
                      style={styles.modalBadge}
                    />
                  ) : null}
                </View>
                <IconButton
                  icon="close"
                  onPress={() => setEditor(null)}
                  accessibilityLabel={t('meals:detailEditorClose')}
                />
              </View>

              <NumberField
                label={t('meals:reviewPortionField')}
                value={editor?.grams ?? null}
                onChange={(grams) =>
                  setEditor((current) => (current ? { ...current, grams } : current))
                }
                suffix={t('units:gram')}
                min={1}
                max={MAX_ENTRY_GRAMS}
                autoFocus
                onSubmitEditing={applyEditor}
                hint={t('meals:detailWasGrams', {
                  amount: formatCount(round(editorEntry.quantityGrams)),
                })}
              />

              <View style={[styles.preview, { backgroundColor: colors.surfaceAlt }]}>
                {editorPreview ? (
                  <>
                    <View style={styles.previewRow}>
                      <Txt variant="label" color="muted">
                        {t('macros:calories')}
                      </Txt>
                      <Txt variant="label" weight="semibold" tabular>
                        {`${formatCount(round(editorPreview.calories))} ${t('units:kcal')}`}
                      </Txt>
                    </View>
                    <View style={styles.previewRow}>
                      <Txt variant="label" color="muted">
                        {t('meals:detailPreviewMacros')}
                      </Txt>
                      <Txt variant="label" weight="semibold" tabular>
                        {`${formatCount(round(editorPreview.protein))} / ${formatCount(
                          round(editorPreview.carbs),
                        )} / ${formatCount(round(editorPreview.fat))} ${t('units:gram')}`}
                      </Txt>
                    </View>
                  </>
                ) : (
                  <Txt variant="label" color="muted">
                    {t('meals:detailPreviewEmpty')}
                  </Txt>
                )}
              </View>

              <View style={styles.modalActions}>
                <Button
                  label={t('common:remove')}
                  variant="danger"
                  size="sm"
                  icon="trash-outline"
                  onPress={removeEditorEntry}
                />
                <Button
                  label={t('meals:detailUpdate')}
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
            accessibilityLabel={t('meals:detailClosePhoto')}
          />
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={styles.viewerImage}
              contentFit="contain"
              accessibilityLabel={t('meals:detailPhotoAlt')}
              pointerEvents="none"
            />
          ) : null}
          <View style={[styles.viewerClose, { top: insets.top + spacing.md }]}>
            <IconButton
              icon="close"
              variant="surface"
              onPress={() => setPhotoOpen(false)}
              accessibilityLabel={t('meals:detailClosePhoto')}
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
    end: spacing.sm,
    position: 'absolute',
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
    marginStart: spacing.xs + 2,
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
    marginStart: spacing.xs,
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
    end: spacing.md,
    position: 'absolute',
  },
});
