import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type AccessibilityProps } from 'react-native';

import {
  AppHeader,
  Badge,
  Button,
  Card,
  Divider,
  IconButton,
  LoadingView,
  NumberField,
  Screen,
  SegmentedControl,
  TextField,
  Txt,
} from '@/components/ui';
import { currentSlot, formatDayLabel, todayKey } from '@/domain/date';
import { makeId } from '@/domain/id';
import { macrosForGrams, sumMacros } from '@/domain/nutrition';
import { MEAL_SLOTS, SLOT_LABELS } from '@/domain/totals';
import {
  analyzeMealPhoto,
  describeVisionError,
  VisionError,
  type VisionErrorCode,
} from '@/services/vision';
import { hasApiKey } from '@/storage/secrets';
import { useApp } from '@/state/AppStore';
import {
  clearPendingPhotoMeal,
  getPendingPhotoMeal,
  setPendingPhotoMeal,
  type PendingPhotoMeal,
} from '@/state/pendingMeal';
import { radius, spacing, useTheme } from '@/theme';
import type { Macros, Meal, MealEntry, MealSlot, PhotoAnalysisResult } from '@/types';

import { formatCount } from '../onboarding/_layout';

type Phase = 'starting' | 'consent' | 'analyzing' | 'reviewing' | 'failed' | 'manual';

interface Failure {
  headline: string;
  suggestion: string;
  code: VisionErrorCode | null;
}

/** One estimated food, held open for editing until the meal is saved. */
interface ReviewRow {
  id: string;
  name: string;
  /** Null while the grams field is empty mid-edit. */
  grams: number | null;
  /** Nutrients per 100 g, so a new portion weight rescales everything. */
  per100: Macros;
  confidence: number;
  note?: string;
}

/** Decoration only: the surrounding text already carries the meaning. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

const SLOT_OPTIONS = MEAL_SLOTS.map((slot) => ({
  value: slot,
  label: SLOT_LABELS[slot],
  icon: {
    breakfast: 'cafe-outline',
    lunch: 'restaurant-outline',
    dinner: 'moon-outline',
    snack: 'nutrition-outline',
  }[slot],
}));

const MAX_GRAMS = 2000;

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

/** Re-expresses a detected portion per 100 g so edits scale it proportionally. */
function per100From(macros: Macros, grams: number): Macros {
  const factor = 100 / Math.max(1, grams);
  return {
    calories: macros.calories * factor,
    protein: macros.protein * factor,
    carbs: macros.carbs * factor,
    fat: macros.fat * factor,
  };
}

function rowsFromAnalysis(result: PhotoAnalysisResult): ReviewRow[] {
  return result.items.map((item) => ({
    id: makeId('e'),
    name: item.name,
    grams: item.quantityGrams,
    per100: per100From(item.macros, item.quantityGrams),
    confidence: item.confidence,
    note: item.note,
  }));
}

function confidenceTone(confidence: number): 'success' | 'warning' | 'danger' {
  if (confidence >= 0.7) return 'success';
  if (confidence >= 0.4) return 'warning';
  return 'danger';
}

/** Groups thousands without losing the one decimal a gram value may carry. */
function grams(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) return formatCount(rounded);
  const [whole, fraction] = rounded.toFixed(1).split('.');
  return `${formatCount(Number(whole))}.${fraction}`;
}

/** Says what the percentage means, so the number is never the whole claim. */
function confidenceWord(confidence: number): string {
  if (confidence >= 0.7) return 'Fairly sure';
  if (confidence >= 0.4) return 'Rough guess';
  return 'Barely a guess';
}

/** Host of the configured API, for the line shown before a photo is uploaded. */
function endpointLabel(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const withoutScheme = trimmed.replace(/^https?:\/\//, '');
  return withoutScheme.split('/')[0] || 'the analysis service';
}

export default function ReviewPhotoMealScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slot?: string; date?: string }>();
  const { colors } = useTheme();
  const { ready, settings, addMeal, setSelectedDate } = useApp();

  // Read once: the handoff slot is cleared on save and must not vanish mid-edit.
  const [pending] = useState<PendingPhotoMeal | null>(() => getPendingPhotoMeal());
  const date = readDate(params.date);

  const [phase, setPhase] = useState<Phase>('starting');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [slot, setSlot] = useState<MealSlot>(() => readSlot(params.slot));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const slotTouched = useRef(false);
  const noteTouched = useRef(false);
  const startedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // A reload drops the in-memory handoff, so there is nothing left to review.
  useEffect(() => {
    if (pending) return;
    router.replace('/meal/camera');
  }, [pending, router]);

  const applyAnalysis = useCallback((result: PhotoAnalysisResult) => {
    setRows(rowsFromAnalysis(result));
    if (result.slot && !slotTouched.current) setSlot(result.slot);
    if (result.summary && !noteTouched.current) setNote(result.summary);
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!pending) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFailure(null);
    setPhase('analyzing');

    try {
      const result = await analyzeMealPhoto({
        uri: pending.photoUri,
        base64: pending.base64,
        mimeType: pending.mimeType,
        settings,
        signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current) return;
      setPendingPhotoMeal({ ...pending, analysis: result, error: undefined });
      applyAnalysis(result);
      setPhase('reviewing');
    } catch (error) {
      if (controller.signal.aborted || !mountedRef.current) return;
      const described = describeVisionError(error);
      setPendingPhotoMeal({ ...pending, error: described.suggestion });
      setFailure({
        ...described,
        code: error instanceof VisionError ? error.code : null,
      });
      setPhase('failed');
    }
  }, [pending, settings, applyAnalysis]);

  // Decide once what this photo needs: rehydrate, ask, analyse, or stay manual.
  useEffect(() => {
    if (!pending || !ready || startedRef.current) return;
    startedRef.current = true;

    if (pending.analysis) {
      applyAnalysis(pending.analysis);
      setPhase('reviewing');
      return;
    }
    if (pending.error) {
      setFailure({ headline: 'Analysis failed', suggestion: pending.error, code: null });
      setPhase('failed');
      return;
    }
    if (settings.photoAnalysis !== 'ai') {
      setPhase('manual');
      return;
    }

    void (async () => {
      // Only ask before an upload that is actually going to happen.
      if (settings.confirmBeforeUpload && (await hasApiKey())) {
        if (mountedRef.current) setPhase('consent');
        return;
      }
      await runAnalysis();
    })();
  }, [pending, ready, settings, applyAnalysis, runAnalysis]);

  const updateRow = useCallback((id: string, patch: Partial<ReviewRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
  }, []);

  const entries = useMemo<MealEntry[]>(
    () =>
      rows
        .filter((row) => row.name.trim().length > 0 && (row.grams ?? 0) > 0)
        .map((row) => {
          const grams = Math.round(row.grams ?? 0);
          return {
            id: row.id,
            name: row.name.trim(),
            quantityGrams: grams,
            servingLabel: `About ${formatCount(grams)} g`,
            macros: macrosForGrams(row.per100, grams),
            source: 'photo' as const,
            confidence: row.confidence,
          };
        }),
    [rows],
  );

  const totals = useMemo(() => sumMacros(entries.map((entry) => entry.macros)), [entries]);
  const canSave = entries.length > 0 || note.trim().length > 0;

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const goToSettings = useCallback(() => router.push('/settings'), [router]);

  const addAnotherFood = useCallback(() => {
    router.push({ pathname: '/meal/add', params: { slot, date } });
  }, [router, slot, date]);

  const retakePhoto = useCallback(() => {
    router.replace({ pathname: '/meal/camera', params: { slot, date } });
  }, [router, slot, date]);

  const save = useCallback(async () => {
    if (!pending || saving || !canSave) return;

    setSaving(true);
    setSaveError(null);

    const meal: Meal = {
      id: makeId('m'),
      date,
      loggedAt: new Date().toISOString(),
      slot,
      entries,
      photoUri: pending.photoUri,
      note: note.trim() || undefined,
    };

    try {
      await addMeal(meal);
      setSelectedDate(date);
      clearPendingPhotoMeal();
      router.replace('/(tabs)');
    } catch {
      if (!mountedRef.current) return;
      setSaving(false);
      setSaveError('This meal could not be saved. Try again in a moment.');
    }
  }, [pending, saving, canSave, date, slot, entries, note, addMeal, setSelectedDate, router]);

  if (!pending) {
    return (
      <Screen>
        <LoadingView message="No photo to review. Opening the camera." />
      </Screen>
    );
  }

  const analysing = phase === 'analyzing';
  /** A new photo is the only thing that can fix these two. */
  const needsNewPhoto = failure?.code === 'unsupported' || failure?.code === 'too-large';
  /** Retrying before the key or the model is fixed will fail the same way. */
  const needsSettings = failure?.code === 'no-key' || failure?.code === 'unsupported';

  return (
    <Screen scroll keyboardAvoiding edges={['top', 'bottom']}>
      <AppHeader
        title="Check the photo"
        subtitle={`${SLOT_LABELS[slot]} · ${formatDayLabel(date)}`}
        onBack={leave}
      />

      <Image
        source={{ uri: pending.photoUri }}
        style={[styles.photo, { backgroundColor: colors.surfaceAlt }]}
        contentFit="cover"
        transition={150}
        accessibilityLabel="The meal you photographed"
      />

      <View
        style={[styles.disclaimer, { backgroundColor: colors.surfaceAlt }]}
        accessible
        accessibilityLabel="These numbers are an estimate from one photo. Correct the names and the grams before saving."
      >
        <Ionicons
          name="information-circle-outline"
          size={18}
          color={colors.textMuted}
          {...DECORATIVE}
        />
        <Txt variant="label" color="muted" style={styles.disclaimerText}>
          Everything below is an estimate from one photo. Correct the names and the grams before
          you save.
        </Txt>
      </View>

      {phase === 'starting' ? (
        <Card style={styles.block}>
          <LoadingView message="Preparing this photo" />
        </Card>
      ) : null}

      {phase === 'consent' ? (
        <Card style={styles.block}>
          <Txt variant="heading">Send this photo for analysis?</Txt>
          <Txt color="muted" style={styles.blockBody}>
            {`The photo is uploaded to ${endpointLabel(settings.aiBaseUrl)} and read by ${settings.aiModel}. Nothing else leaves your device.`}
          </Txt>
          <View style={styles.blockActions}>
            <Button
              label="Analyse photo"
              icon="sparkles-outline"
              onPress={() => void runAnalysis()}
              fullWidth
            />
            <Button
              label="Not now, log it myself"
              variant="secondary"
              onPress={() => setPhase('manual')}
              fullWidth
            />
          </View>
        </Card>
      ) : null}

      {analysing ? (
        <Card style={styles.block}>
          <LoadingView message="Reading the plate. This usually takes a few seconds." />
          <Button
            label="Cancel and log it myself"
            variant="ghost"
            onPress={() => {
              abortRef.current?.abort();
              setPhase('manual');
            }}
            fullWidth
          />
        </Card>
      ) : null}

      {phase === 'failed' && failure ? (
        <Card style={styles.block}>
          <Txt variant="heading" color="danger">
            {failure.headline}
          </Txt>
          <Txt color="muted" style={styles.blockBody}>
            {failure.suggestion}
          </Txt>
          <View style={styles.blockActions}>
            {needsSettings ? (
              <Button
                label="Open Settings"
                icon="settings-outline"
                onPress={goToSettings}
                fullWidth
              />
            ) : (
              <Button
                label="Try again"
                icon="refresh-outline"
                onPress={() => void runAnalysis()}
                fullWidth
              />
            )}

            {needsNewPhoto ? (
              <Button
                label="Take another photo"
                icon="camera-outline"
                variant="secondary"
                onPress={retakePhoto}
                fullWidth
              />
            ) : null}

            {needsSettings ? (
              <Button
                label="Try again"
                icon="refresh-outline"
                variant="secondary"
                onPress={() => void runAnalysis()}
                fullWidth
              />
            ) : null}

            <Button
              label="Log this photo by hand"
              variant="ghost"
              onPress={() => {
                setFailure(null);
                setPhase('manual');
              }}
              fullWidth
            />
          </View>
          <Txt variant="caption" color="faint" align="center" style={styles.blockFoot}>
            The photo is still here. You can save it with a note and fill in the foods later.
          </Txt>
        </Card>
      ) : null}

      {phase === 'manual' ? (
        <Card style={styles.block}>
          <Txt variant="heading">Logging it by hand</Txt>
          <Txt color="muted" style={styles.blockBody}>
            Search the database for each food, or keep the photo with a note and fill in the
            details later.
          </Txt>
          <View style={styles.blockActions}>
            <Button
              label="Search the food database"
              icon="search-outline"
              variant="secondary"
              onPress={addAnotherFood}
              fullWidth
            />
          </View>
          <Txt variant="caption" color="faint" style={styles.blockFoot}>
            Foods added from the search are logged as their own meal for this day.
          </Txt>
        </Card>
      ) : null}

      {phase === 'reviewing' && rows.length === 0 ? (
        <Card style={styles.block}>
          <Txt variant="heading">Nothing recognised</Txt>
          <Txt color="muted" style={styles.blockBody}>
            The model could not name anything on this plate. Add the foods yourself, or save the
            photo with a note.
          </Txt>
          <View style={styles.blockActions}>
            <Button
              label="Try again"
              icon="refresh-outline"
              onPress={() => void runAnalysis()}
              fullWidth
            />
            <Button
              label="Search the food database"
              icon="search-outline"
              variant="secondary"
              onPress={addAnotherFood}
              fullWidth
            />
          </View>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <Txt variant="caption" color="faint" weight="semibold" style={styles.sectionHead}>
          {rows.length === 1 ? '1 ITEM FOUND' : `${rows.length} ITEMS FOUND`}
        </Txt>
      ) : null}

      {rows.map((row) => {
        const macros = macrosForGrams(row.per100, row.grams ?? 0);
        return (
          <Card key={row.id} style={styles.rowCard}>
            <View style={styles.rowHead}>
              <Badge
                label={`${confidenceWord(row.confidence)} · ${Math.round(row.confidence * 100)}%`}
                tone={confidenceTone(row.confidence)}
              />
              <IconButton
                icon="trash-outline"
                variant="danger"
                size={18}
                accessibilityLabel={`Remove ${row.name || 'this item'}`}
                onPress={() => removeRow(row.id)}
                style={styles.rowRemove}
              />
            </View>

            <TextField
              label="Food"
              value={row.name}
              onChangeText={(text) => updateRow(row.id, { name: text })}
              placeholder="Name this item"
              maxLength={80}
              autoCapitalize="sentences"
              style={styles.rowField}
            />

            <NumberField
              label="Portion"
              value={row.grams}
              onChange={(value) => updateRow(row.id, { grams: value })}
              suffix="g"
              placeholder="0"
              min={1}
              max={MAX_GRAMS}
              style={styles.rowField}
            />

            <Divider />

            <View style={styles.macroStrip}>
              <View style={styles.macroEnergy}>
                <Txt weight="bold" tabular>
                  {formatCount(macros.calories)}
                </Txt>
                <Txt variant="label" color="faint" weight="medium">
                  kcal
                </Txt>
              </View>
              <Txt variant="label" color="muted" tabular>
                {`P ${grams(macros.protein)} g · C ${grams(macros.carbs)} g · F ${grams(macros.fat)} g`}
              </Txt>
            </View>

            {row.note ? (
              <Txt variant="caption" color="faint" style={styles.rowNote}>
                {row.note}
              </Txt>
            ) : null}
          </Card>
        );
      })}

      {entries.length > 0 ? (
        <Card style={[styles.block, styles.totalsCard]}>
          <View style={styles.totalsText}>
            <Txt variant="caption" color="faint" weight="semibold">
              MEAL TOTAL
            </Txt>
            <Txt variant="label" color="muted" style={styles.totalsMacros} tabular>
              {`P ${grams(totals.protein)} g · C ${grams(totals.carbs)} g · F ${grams(totals.fat)} g`}
            </Txt>
          </View>
          <View style={styles.totalsValue}>
            <Txt variant="title" tabular>
              {formatCount(totals.calories)}
            </Txt>
            <Txt variant="label" color="faint" weight="medium">
              kcal
            </Txt>
          </View>
        </Card>
      ) : null}

      {phase === 'reviewing' && rows.length > 0 ? (
        <Button
          label="Add a food the model missed"
          icon="add-circle-outline"
          variant="secondary"
          onPress={addAnotherFood}
          fullWidth
          style={styles.block}
        />
      ) : null}

      <View style={styles.block}>
        <Txt variant="label" color="muted" weight="medium" style={styles.fieldLabel}>
          Meal
        </Txt>
        <SegmentedControl<MealSlot>
          options={SLOT_OPTIONS}
          value={slot}
          onChange={(next) => {
            slotTouched.current = true;
            setSlot(next);
          }}
        />
      </View>

      <TextField
        label="Note"
        value={note}
        onChangeText={(text) => {
          noteTouched.current = true;
          setNote(text);
        }}
        placeholder="What was on the plate?"
        hint="A note on its own is enough to keep the photo, even with no foods listed."
        multiline
        maxLength={240}
        style={styles.block}
      />

      {saveError ? (
        <Txt variant="label" color="danger" style={styles.saveError}>
          {saveError}
        </Txt>
      ) : null}

      <Button
        label={
          entries.length > 0
            ? `Log ${entries.length === 1 ? '1 food' : `${entries.length} foods`}`
            : 'Save photo'
        }
        icon="checkmark-circle-outline"
        onPress={() => void save()}
        disabled={!canSave || analysing}
        loading={saving}
        accessibilityHint={`Saves this photo to ${SLOT_LABELS[slot].toLowerCase()} on ${formatDayLabel(date)}`}
        fullWidth
        size="lg"
        style={styles.save}
      />

      {!canSave ? (
        <Txt variant="caption" color="faint" align="center" style={styles.saveHint}>
          Add at least one food or write a note to save this photo.
        </Txt>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: {
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    width: '100%',
  },
  disclaimer: {
    alignItems: 'flex-start',
    borderRadius: radius.md,
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginTop: spacing.md,
    padding: spacing.md,
  },
  disclaimerText: {
    flex: 1,
  },
  block: {
    marginTop: spacing.xl,
  },
  blockBody: {
    marginTop: spacing.sm,
  },
  blockActions: {
    marginTop: spacing.lg,
    rowGap: spacing.sm,
  },
  blockFoot: {
    marginTop: spacing.md,
  },
  sectionHead: {
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    marginTop: spacing.xl,
  },
  rowCard: {
    marginBottom: spacing.md,
  },
  rowHead: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  rowRemove: {
    marginRight: -spacing.sm,
    marginVertical: -spacing.sm,
  },
  rowField: {
    marginBottom: spacing.md,
  },
  macroStrip: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    rowGap: 2,
  },
  macroEnergy: {
    alignItems: 'baseline',
    columnGap: spacing.xs,
    flexDirection: 'row',
  },
  rowNote: {
    marginTop: spacing.sm,
  },
  totalsCard: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalsText: {
    flexShrink: 1,
  },
  totalsMacros: {
    marginTop: 2,
  },
  totalsValue: {
    alignItems: 'baseline',
    columnGap: spacing.xs,
    flexDirection: 'row',
  },
  fieldLabel: {
    marginBottom: spacing.sm,
  },
  saveError: {
    marginTop: spacing.lg,
  },
  save: {
    marginTop: spacing.xl,
  },
  saveHint: {
    marginTop: spacing.sm,
  },
});
