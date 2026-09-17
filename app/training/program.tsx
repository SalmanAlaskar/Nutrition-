import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { plannedLabel } from '@/components/training/ExerciseRow';
import {
  AppHeader,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  LoadingView,
  NumberField,
  Screen,
  Txt,
} from '@/components/ui';
import { exerciseById } from '@/data/exercises';
import { DEFAULT_PROGRAM, SESSION_LABELS, fallbackExerciseName } from '@/domain/training';
import { useApp } from '@/state/AppStore';
import { radius, spacing, useTheme } from '@/theme';
import type { PlannedExercise, Program, ProgramDay } from '@/types';

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const REST_LABEL = 'Rest';

/** Defaults for an exercise added to a day by hand. */
const NEW_PLANNED: Omit<PlannedExercise, 'exerciseId'> = {
  sets: 3,
  repsLow: 8,
  repsHigh: 12,
  restSeconds: 90,
};

const MIN_SETS = 1;
const MAX_SETS = 10;
const MIN_REPS = 1;
const MAX_REPS = 50;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/** Alert is a no-op on react-native-web, so the browser gets its own dialog. */
function confirmAction({ title, message, confirmLabel, onConfirm }: ConfirmOptions): void {
  if (Platform.OS === 'web') {
    const canAsk = typeof window !== 'undefined' && typeof window.confirm === 'function';
    if (!canAsk || window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

/** Edit the weekly schedule and what each training day contains. */
export default function ProgramScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useTheme();
  const { ready, program, customExercises, saveProgram } = useApp();

  const dayIdParam = firstParam(params.dayId);
  const addExerciseId = firstParam(params.addExerciseId);
  const pickToken = firstParam(params.pick);

  const [openKey, setOpenKey] = useState<string | null>(null);

  const save = useCallback(
    (next: Program) => {
      saveProgram(next).catch((cause: unknown) =>
        console.warn('[program] save failed', cause),
      );
    },
    [saveProgram],
  );

  const setScheduleDay = useCallback(
    (weekday: number, dayId: string | null) => {
      if (!program) return;
      save({ ...program, schedule: { ...program.schedule, [weekday]: dayId } });
    },
    [program, save],
  );

  const replaceDay = useCallback(
    (dayId: string, exercises: PlannedExercise[]) => {
      if (!program) return;
      save({
        ...program,
        days: program.days.map((day) => (day.id === dayId ? { ...day, exercises } : day)),
      });
    },
    [program, save],
  );

  const updatePlanned = useCallback(
    (day: ProgramDay, index: number, patch: Partial<PlannedExercise>) => {
      const exercises = day.exercises.slice();
      const merged: PlannedExercise = { ...exercises[index], ...patch };
      // A range only reads as a range while the low end stays at or below the high.
      if (merged.repsHigh < merged.repsLow) merged.repsHigh = merged.repsLow;
      exercises[index] = merged;
      replaceDay(day.id, exercises);
    },
    [replaceDay],
  );

  const movePlanned = useCallback(
    (day: ProgramDay, index: number, offset: number) => {
      const target = index + offset;
      if (target < 0 || target >= day.exercises.length) return;
      const exercises = day.exercises.slice();
      const [moved] = exercises.splice(index, 1);
      exercises.splice(target, 0, moved);
      setOpenKey(`${day.id}:${target}`);
      replaceDay(day.id, exercises);
    },
    [replaceDay],
  );

  const removePlanned = useCallback(
    (day: ProgramDay, index: number) => {
      setOpenKey(null);
      replaceDay(
        day.id,
        day.exercises.filter((_, position) => position !== index),
      );
    },
    [replaceDay],
  );

  const openPicker = useCallback(
    (day: ProgramDay) => {
      router.push({
        pathname: '/training/exercise-picker',
        params: { returnTo: 'program', dayId: day.id, type: day.type },
      });
    },
    [router],
  );

  /* --------------------------------------------- exercise picked elsewhere -- */

  const appliedPickRef = useRef<string | null>(null);

  useEffect(() => {
    if (!program || !addExerciseId || !dayIdParam) return;
    const token = pickToken ?? addExerciseId;
    if (appliedPickRef.current === token) return;
    appliedPickRef.current = token;

    const day = program.days.find((item) => item.id === dayIdParam);
    if (day) {
      replaceDay(day.id, [...day.exercises, { exerciseId: addExerciseId, ...NEW_PLANNED }]);
    }
    // Clearing the params keeps a later re-render from adding it twice.
    router.setParams({ addExerciseId: '', pick: '' });
  }, [program, addExerciseId, pickToken, dayIdParam, replaceDay, router]);

  /* --------------------------------------------------------------- actions -- */

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/training');
  }, [router]);

  const resetToDefault = useCallback(() => {
    confirmAction({
      title: 'Reset program',
      message:
        'The weekly schedule and every day goes back to the bundled Push / Pull / Legs split. Logged sessions are kept.',
      confirmLabel: 'Reset',
      onConfirm: () => save(DEFAULT_PROGRAM),
    });
  }, [save]);

  if (!ready || !program) {
    return (
      <Screen>
        <LoadingView message="Loading your program" />
      </Screen>
    );
  }

  const trainingDays = WEEKDAY_NAMES.filter((_, weekday) => program.schedule[weekday]).length;
  const restDays = WEEKDAY_NAMES.length - trainingDays;

  return (
    <Screen scroll keyboardAvoiding edges={['top', 'bottom']}>
      <AppHeader
        title="Program"
        subtitle={`${program.name} · ${trainingDays} training, ${restDays} rest`}
        onBack={goBack}
      />

      <Txt variant="caption" color="faint" weight="bold" style={styles.sectionLabel}>
        WEEK
      </Txt>

      <Card padded={false}>
        {WEEKDAY_NAMES.map((weekdayName, weekday) => {
          const assigned = program.schedule[weekday] ?? null;
          return (
            <View key={weekdayName}>
              {weekday > 0 ? <Divider inset /> : null}
              <View style={styles.weekRow}>
                <Txt weight="semibold" style={styles.weekday} numberOfLines={1}>
                  {WEEKDAY_SHORT[weekday]}
                </Txt>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.weekChips}
                >
                  {program.days.map((day) => (
                    <Chip
                      key={day.id}
                      label={day.label}
                      selected={assigned === day.id}
                      onPress={() => setScheduleDay(weekday, day.id)}
                    />
                  ))}
                  <Chip
                    label={REST_LABEL}
                    icon="moon-outline"
                    selected={assigned === null}
                    onPress={() => setScheduleDay(weekday, null)}
                  />
                </ScrollView>
              </View>
            </View>
          );
        })}
      </Card>

      <Txt variant="caption" color="faint" weight="bold" style={styles.sectionLabel}>
        DAYS
      </Txt>

      {program.days.map((day) => (
        <Card key={day.id} style={styles.dayCard}>
          <Txt variant="heading" weight="bold" numberOfLines={1}>
            {day.label}
          </Txt>
          <Txt variant="label" color="muted" numberOfLines={1}>
            {`${SESSION_LABELS[day.type]} · ${day.exercises.length} ${
              day.exercises.length === 1 ? 'exercise' : 'exercises'
            }`}
          </Txt>

          <View style={styles.plannedList}>
            {day.exercises.map((planned, index) => {
              const key = `${day.id}:${index}`;
              const expanded = openKey === key;
              const catalogue = exerciseById(planned.exerciseId, customExercises);
              const name = catalogue?.name ?? fallbackExerciseName(planned.exerciseId);

              return (
                <View
                  key={key}
                  style={[
                    styles.planned,
                    { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.plannedRow}>
                    <Pressable
                      onPress={() => setOpenKey(expanded ? null : key)}
                      accessibilityRole="button"
                      accessibilityLabel={`${name}, ${plannedLabel(planned)}`}
                      accessibilityHint="Opens sets and reps"
                      accessibilityState={{ expanded }}
                      style={({ pressed }) => [styles.plannedMain, pressed ? styles.pressed : null]}
                    >
                      <Txt weight="medium" numberOfLines={1}>
                        {name}
                      </Txt>
                      <Txt variant="label" color="muted" numberOfLines={1} style={styles.plannedMeta}>
                        {plannedLabel(planned)}
                      </Txt>
                    </Pressable>

                    <IconButton
                      icon={expanded ? 'chevron-up' : 'chevron-down'}
                      onPress={() => setOpenKey(expanded ? null : key)}
                      accessibilityLabel={expanded ? `Close ${name}` : `Edit ${name}`}
                      size={18}
                    />
                  </View>

                  {expanded ? (
                    <View style={styles.editor}>
                      <View style={styles.fields}>
                        <NumberField
                          label="Sets"
                          value={planned.sets}
                          onChange={(sets) => {
                            if (sets !== null) updatePlanned(day, index, { sets });
                          }}
                          min={MIN_SETS}
                          max={MAX_SETS}
                          style={styles.field}
                        />
                        <NumberField
                          label="Min reps"
                          value={planned.repsLow}
                          onChange={(repsLow) => {
                            if (repsLow !== null) updatePlanned(day, index, { repsLow });
                          }}
                          min={MIN_REPS}
                          max={MAX_REPS}
                          style={styles.field}
                        />
                        <NumberField
                          label="Max reps"
                          value={planned.repsHigh}
                          onChange={(repsHigh) => {
                            if (repsHigh !== null) updatePlanned(day, index, { repsHigh });
                          }}
                          min={MIN_REPS}
                          max={MAX_REPS}
                          style={styles.field}
                        />
                      </View>

                      <View style={styles.editorActions}>
                        <IconButton
                          icon="arrow-up"
                          onPress={() => movePlanned(day, index, -1)}
                          accessibilityLabel={`Move ${name} up`}
                          variant="surface"
                          size={18}
                          disabled={index === 0}
                        />
                        <IconButton
                          icon="arrow-down"
                          onPress={() => movePlanned(day, index, 1)}
                          accessibilityLabel={`Move ${name} down`}
                          variant="surface"
                          size={18}
                          disabled={index === day.exercises.length - 1}
                        />
                        <IconButton
                          icon="trash-outline"
                          onPress={() => removePlanned(day, index)}
                          accessibilityLabel={`Remove ${name} from ${day.label}`}
                          variant="danger"
                          size={18}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          <Button
            label="Add exercise"
            icon="add"
            onPress={() => openPicker(day)}
            variant="secondary"
            size="sm"
            accessibilityHint={`Adds an exercise to ${day.label}`}
            style={styles.addExercise}
          />
        </Card>
      ))}

      <Button
        label="Reset to default"
        icon="refresh"
        onPress={resetToDefault}
        variant="danger"
        fullWidth
        accessibilityHint="Asks you to confirm before the program is replaced"
        style={styles.reset}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  weekRow: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    minHeight: 56,
    paddingEnd: spacing.md,
    paddingStart: spacing.lg,
  },
  weekday: {
    width: 40,
  },
  weekChips: {
    alignItems: 'center',
    columnGap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  dayCard: {
    marginBottom: spacing.md,
  },
  plannedList: {
    marginTop: spacing.md,
    rowGap: spacing.sm,
  },
  planned: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  plannedRow: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  plannedMain: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  plannedMeta: {
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  editor: {
    marginBottom: spacing.sm,
  },
  fields: {
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  field: {
    flex: 1,
    flexBasis: 0,
  },
  editorActions: {
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  addExercise: {
    marginTop: spacing.md,
  },
  reset: {
    marginTop: spacing.lg,
  },
});
