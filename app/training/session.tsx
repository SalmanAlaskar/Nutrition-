import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ExerciseRow } from '@/components/training/ExerciseRow';
import { useTrainingText } from '@/components/training/useTrainingText';
import {
  AppHeader,
  Badge,
  Button,
  Card,
  LoadingView,
  Screen,
  TextField,
  Txt,
} from '@/components/ui';
import { exerciseById } from '@/data/exercises';
import { todayKey } from '@/domain/date';
import { formatCount, formatPercent } from '@/domain/format';
import { makeId } from '@/domain/id';
import { dayForDate, fallbackExerciseName, sessionFromDay } from '@/domain/training';
import { useApp } from '@/state/AppStore';
import * as repo from '@/storage/repository';
import { radius, spacing, useTheme } from '@/theme';
import type {
  Exercise,
  LoggedExercise,
  PlannedExercise,
  Program,
  ProgramDay,
  SetLog,
  WorkoutSession,
} from '@/types';

/** How long a typed number sits before it is written to storage. */
const WRITE_DELAY_MS = 600;
/** Sets an exercise added mid-session starts with. */
const DEFAULT_SETS = 3;
const NOTE_MAX = 300;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readDate(value: string | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayKey();
}

/** The planned day this session follows, or null when it is an extra one. */
function findDay(program: Program | null, dayId: string | undefined, date: string): ProgramDay | null {
  if (!program) return null;
  if (dayId) return program.days.find((day) => day.id === dayId) ?? null;
  return dayForDate(program, date);
}

/**
 * A session with no program day behind it: whatever the user adds to it. It
 * carries no dayLabel, because a label written now would be stuck in the
 * language it was written in.
 */
function emptySession(date: string, programId?: string): WorkoutSession {
  return {
    id: makeId('ws'),
    date,
    startedAt: new Date().toISOString(),
    type: 'full',
    programId,
    exercises: [],
  };
}

/** Real catalogue names, so history is readable however the program changes. */
function withResolvedNames(
  session: WorkoutSession,
  custom: Exercise[],
): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      name: exerciseById(exercise.exerciseId, custom)?.name ?? exercise.name,
    })),
  };
}

function newLoggedExercise(exerciseId: string, custom: Exercise[]): LoggedExercise {
  const exercise = exerciseById(exerciseId, custom);
  return {
    exerciseId,
    name: exercise?.name ?? fallbackExerciseName(exerciseId),
    done: false,
    sets: Array.from({ length: DEFAULT_SETS }, (): SetLog => ({ done: false })),
  };
}

/** Log one training session: tick what you did, fill in reps and load if you want. */
export default function SessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useTheme();
  const { t } = useTranslation('training');
  const text = useTrainingText();
  const { ready, program, customExercises, addWorkout, updateWorkout } = useApp();

  const date = readDate(firstParam(params.date));
  const dayId = firstParam(params.dayId);
  const addExerciseId = firstParam(params.addExerciseId);
  const pickToken = firstParam(params.pick);

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const day = useMemo(() => findDay(program, dayId, date), [program, dayId, date]);

  const plannedById = useMemo(() => {
    const map: Record<string, PlannedExercise> = {};
    if (day) {
      for (const planned of day.exercises) map[planned.exerciseId] = planned;
    }
    return map;
  }, [day]);

  /* ------------------------------------------------------------- saving -- */

  const savedRef = useRef(false);
  const failedRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<WorkoutSession | null>(null);

  // Writes are chained rather than fired in parallel: two saves a keystroke
  // apart must land in the order they were made.
  const write = useCallback(
    (next: WorkoutSession) => {
      const existed = savedRef.current;
      savedRef.current = true;
      queueRef.current = queueRef.current
        .then(() => (existed ? updateWorkout(next) : addWorkout(next)))
        .then(() => {
          failedRef.current = false;
        })
        .catch((cause: unknown) => {
          console.warn('[session] save failed', cause);
          failedRef.current = true;
          setError(t('sessionSaveFailed'));
        });
    },
    [addWorkout, updateWorkout, t],
  );

  // The unmount cleanup must see the latest writer, not the one from mount.
  const writeRef = useRef(write);
  writeRef.current = write;

  const commit = useCallback((next: WorkoutSession) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    writeRef.current(next);
  }, []);

  const schedule = useCallback((next: WorkoutSession) => {
    pendingRef.current = next;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) writeRef.current(pending);
    }, WRITE_DELAY_MS);
  }, []);

  const flushPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) writeRef.current(pending);
  }, []);

  // Leaving the screen must not drop a number typed a moment ago.
  const flushRef = useRef(flushPending);
  flushRef.current = flushPending;
  useEffect(() => () => flushRef.current(), []);

  /* -------------------------------------------------------------- loading -- */

  const loadKey = `${date}|${dayId ?? ''}`;
  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (loadedKeyRef.current === loadKey) return;
    loadedKeyRef.current = loadKey;

    let active = true;
    (async () => {
      const stored = await repo.getWorkoutsForDate(date);
      const existing = dayId
        ? stored.find((item) => item.dayId === dayId)
        : stored.find((item) => !item.dayId) ?? stored[0];
      if (!active) return;

      if (existing) {
        savedRef.current = true;
        setSession(existing);
      } else {
        savedRef.current = false;
        const fresh = day
          ? { ...sessionFromDay(day, date), programId: program?.id }
          : emptySession(date, program?.id);
        setSession(withResolvedNames(fresh, customExercises));
      }
      setLoading(false);
    })().catch((cause: unknown) => {
      console.warn('[session] load failed', cause);
      if (!active) return;
      savedRef.current = false;
      setSession(day ? sessionFromDay(day, date) : emptySession(date));
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [ready, loadKey, date, dayId, day, program, customExercises]);

  /* ------------------------------------------------------------ mutation -- */

  const apply = useCallback(
    (next: WorkoutSession, immediate: boolean) => {
      setSession(next);
      setError(null);
      if (immediate) commit(next);
      else schedule(next);
    },
    [commit, schedule],
  );

  const replaceExercise = useCallback(
    (index: number, exercise: LoggedExercise): WorkoutSession | null => {
      if (!session) return null;
      const exercises = session.exercises.slice();
      exercises[index] = exercise;
      return { ...session, exercises };
    },
    [session],
  );

  const toggleDone = useCallback(
    (index: number) => {
      if (!session) return;
      const exercise = session.exercises[index];
      const done = !exercise.done;
      // A tick with nothing typed in still means the planned sets were done, so
      // the week's volume reflects the work even when no reps were entered.
      const next = replaceExercise(index, {
        ...exercise,
        done,
        sets: exercise.sets.map((set) => ({ ...set, done })),
      });
      if (next) apply(next, true);
    },
    [session, replaceExercise, apply],
  );

  const changeSet = useCallback(
    (index: number, setIndex: number, patch: Partial<SetLog>) => {
      if (!session) return;
      const exercise = session.exercises[index];
      const sets = exercise.sets.slice();
      const merged: SetLog = { ...sets[setIndex], ...patch };
      // Reps are the proof a set happened; a ticked exercise keeps its sets done.
      merged.done = merged.reps !== undefined || exercise.done;
      sets[setIndex] = merged;
      const next = replaceExercise(index, { ...exercise, sets });
      if (next) apply(next, false);
    },
    [session, replaceExercise, apply],
  );

  const addSet = useCallback(
    (index: number) => {
      if (!session) return;
      const exercise = session.exercises[index];
      const next = replaceExercise(index, {
        ...exercise,
        sets: [...exercise.sets, { done: exercise.done }],
      });
      if (next) apply(next, true);
    },
    [session, replaceExercise, apply],
  );

  const removeSet = useCallback(
    (index: number, setIndex: number) => {
      if (!session) return;
      const exercise = session.exercises[index];
      const next = replaceExercise(index, {
        ...exercise,
        sets: exercise.sets.filter((_, position) => position !== setIndex),
      });
      if (next) apply(next, true);
    },
    [session, replaceExercise, apply],
  );

  const removeExercise = useCallback(
    (index: number) => {
      if (!session) return;
      setOpenIndex(null);
      apply(
        {
          ...session,
          exercises: session.exercises.filter((_, position) => position !== index),
        },
        true,
      );
    },
    [session, apply],
  );

  const changeNote = useCallback(
    (note: string) => {
      if (!session) return;
      apply({ ...session, note: note.length > 0 ? note : undefined }, false);
    },
    [session, apply],
  );

  /* --------------------------------------------- exercise picked elsewhere -- */

  const appliedPickRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session || !addExerciseId) return;
    const token = pickToken ?? addExerciseId;
    if (appliedPickRef.current === token) return;
    appliedPickRef.current = token;

    apply(
      {
        ...session,
        exercises: [...session.exercises, newLoggedExercise(addExerciseId, customExercises)],
      },
      true,
    );
    // Clearing the params keeps a later re-render from adding it twice.
    router.setParams({ addExerciseId: '', pick: '' });
  }, [session, addExerciseId, pickToken, customExercises, apply, router]);

  /* --------------------------------------------------------------- actions -- */

  // The training tab reads sessions straight from storage when it regains
  // focus, so this screen only leaves once its own writes have landed.
  const close = useCallback(() => {
    if (leaving) return;
    flushPending();
    setLeaving(true);
    void queueRef.current.then(() => {
      setLeaving(false);
      if (failedRef.current) {
        setError(t('sessionSaveFailed'));
        return;
      }
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/training');
    });
  }, [leaving, flushPending, router, t]);

  const openPicker = useCallback(() => {
    const next: Record<string, string> = { returnTo: 'session', date };
    if (dayId) next.dayId = dayId;
    if (session) next.type = session.type;
    router.push({ pathname: '/training/exercise-picker', params: next });
  }, [router, date, dayId, session]);

  const doneCount = session ? session.exercises.filter((exercise) => exercise.done).length : 0;
  const total = session ? session.exercises.length : 0;
  const ratio = total > 0 ? doneCount / total : 0;
  const completed = Boolean(session?.completedAt);

  const finish = useCallback(() => {
    if (!session) return;
    if (doneCount === 0) {
      setError(t('needOneExercise'));
      return;
    }
    const next: WorkoutSession = {
      ...session,
      completedAt: session.completedAt ?? new Date().toISOString(),
    };
    setSession(next);
    commit(next);
    close();
  }, [session, doneCount, commit, close, t]);

  if (!ready || loading || !session) {
    return (
      <Screen>
        <LoadingView message={t('sessionLoading')} />
      </Screen>
    );
  }

  const title = day ? text.day(day) : (session.dayLabel ?? t('extraSession'));
  const muscles = text.muscles(day ? day.type : session.type);

  return (
    <Screen scroll keyboardAvoiding edges={['top', 'bottom']}>
      <AppHeader
        title={title}
        subtitle={`${text.date(date)} · ${muscles}`}
        onBack={close}
        right={completed ? <Badge label={t('statusDone')} tone="success" /> : undefined}
      />

      <Card>
        <View style={styles.progressTop}>
          <Txt
            variant="label"
            color="muted"
            weight="semibold"
            numberOfLines={1}
            style={styles.progressLabel}
          >
            {total > 0
              ? t('progressDone', { done: formatCount(doneCount), total: formatCount(total) })
              : t('progressEmpty')}
          </Txt>
          <Txt variant="label" color="muted" tabular>
            {formatPercent(ratio)}
          </Txt>
        </View>
        <View
          style={[styles.track, { backgroundColor: colors.track }]}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: total, now: doneCount }}
          accessibilityLabel={t('progressSpoken')}
        >
          <View
            style={[
              styles.fill,
              { backgroundColor: colors.accent, width: `${Math.round(ratio * 100)}%` },
            ]}
          />
        </View>
      </Card>

      <View style={styles.list}>
        {session.exercises.map((exercise, index) => {
          const catalogue = exerciseById(exercise.exerciseId, customExercises);
          const planned = plannedById[exercise.exerciseId];
          return (
            <ExerciseRow
              key={`${exercise.exerciseId}-${index}`}
              name={catalogue ? text.name(catalogue) : exercise.name}
              altName={catalogue ? text.altName(catalogue) : undefined}
              meta={catalogue ? text.meta(catalogue) : undefined}
              planned={planned ? text.planned(planned) : undefined}
              cue={catalogue ? text.cue(catalogue) : undefined}
              done={exercise.done}
              onToggleDone={() => toggleDone(index)}
              sets={exercise.sets}
              expanded={openIndex === index}
              onToggleExpanded={() => setOpenIndex(openIndex === index ? null : index)}
              onChangeSet={(setIndex, patch) => changeSet(index, setIndex, patch)}
              onAddSet={() => addSet(index)}
              onRemoveSet={(setIndex) => removeSet(index, setIndex)}
              onRemove={() => removeExercise(index)}
              style={styles.row}
            />
          );
        })}
      </View>

      <Button
        label={t('addExercise')}
        icon="add"
        onPress={openPicker}
        variant="secondary"
        fullWidth
        style={styles.add}
      />

      <TextField
        label={t('noteLabel')}
        value={session.note ?? ''}
        onChangeText={changeNote}
        placeholder={t('notePlaceholder')}
        multiline
        maxLength={NOTE_MAX}
        style={styles.note}
      />

      {error ? (
        <Txt variant="label" color="danger" style={styles.error}>
          {error}
        </Txt>
      ) : null}

      <Button
        label={completed ? t('saveChanges') : t('finishSession')}
        icon="checkmark"
        onPress={finish}
        loading={leaving}
        fullWidth
        accessibilityHint={completed ? t('saveChangesHint') : t('finishHint')}
        style={styles.finish}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressTop: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  progressLabel: {
    flexShrink: 1,
  },
  track: {
    borderRadius: radius.pill,
    height: 8,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    borderRadius: radius.pill,
    height: '100%',
  },
  list: {
    marginTop: spacing.lg,
    rowGap: spacing.sm,
  },
  row: {
    width: '100%',
  },
  add: {
    marginTop: spacing.lg,
  },
  note: {
    marginTop: spacing.xl,
  },
  error: {
    marginTop: spacing.md,
  },
  finish: {
    marginTop: spacing.xl,
  },
});
