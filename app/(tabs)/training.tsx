import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DayCard, type DayCardExercise, type DayCardStatus } from '@/components/training/DayCard';
import { plannedLabel } from '@/components/training/ExerciseRow';
import { WeekStrip, type WeekStripDay } from '@/components/training/WeekStrip';
import {
  AppHeader,
  Card,
  IconButton,
  ListRow,
  LoadingView,
  Screen,
  StatTile,
  Txt,
} from '@/components/ui';
import { exerciseById } from '@/data/exercises';
import { formatDayLabel, todayKey } from '@/domain/date';
import {
  SESSION_LABELS,
  dayForDate,
  trainingStreak,
  weekDates,
  weeklyVolume,
} from '@/domain/training';
import { useApp } from '@/state/AppStore';
import * as repo from '@/storage/repository';
import { radius, spacing, useTheme } from '@/theme';
import type { PlannedExercise, SessionType, WorkoutSession } from '@/types';

const WEEKDAYS_IN_WEEK = 7;

interface VolumeRow {
  type: SessionType;
  sets: number;
}

/** Bar lengths are relative to the busiest day type, never to a fixed ceiling. */
function VolumeBar({ row, max }: { row: VolumeRow; max: number }) {
  const { colors } = useTheme();
  const share = max > 0 ? row.sets / max : 0;
  const empty = row.sets === 0;

  return (
    <View
      style={styles.volumeRow}
      accessible
      accessibilityLabel={`${SESSION_LABELS[row.type]}, ${row.sets} ${
        row.sets === 1 ? 'set' : 'sets'
      } this week`}
    >
      <Txt variant="label" color={empty ? 'faint' : 'text'} style={styles.volumeLabel} numberOfLines={1}>
        {SESSION_LABELS[row.type]}
      </Txt>
      <View style={[styles.volumeTrack, { backgroundColor: colors.track }]}>
        <View
          style={[
            styles.volumeFill,
            {
              backgroundColor: empty ? colors.border : colors.accent,
              width: `${Math.max(Math.round(share * 100), empty ? 0 : 6)}%`,
            },
          ]}
        />
      </View>
      <Txt variant="label" color={empty ? 'faint' : 'muted'} tabular style={styles.volumeValue}>
        {row.sets}
      </Txt>
    </View>
  );
}

/** The training week: what today holds, what is done, and where the volume went. */
export default function TrainingScreen() {
  const router = useRouter();
  const { ready, program, workoutDates, customExercises, refresh } = useApp();

  const today = todayKey();
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekSessions, setWeekSessions] = useState<Record<string, WorkoutSession[]>>({});
  const [refreshing, setRefreshing] = useState(false);

  const week = useMemo(() => weekDates(today), [today]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      repo
        .getWorkoutsForDates(week)
        .then((sessions) => {
          if (active) setWeekSessions(sessions);
        })
        .catch((cause: unknown) => console.warn('[training] week load failed', cause));
      return () => {
        active = false;
      };
      // workoutDates moves whenever a session is saved, which is the cue to reload.
    }, [week, workoutDates]),
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([refresh(), repo.getWorkoutsForDates(week)])
      .then(([, sessions]) => setWeekSessions(sessions))
      .catch((cause: unknown) => console.warn('[training] refresh failed', cause))
      .finally(() => setRefreshing(false));
  }, [refresh, week]);

  const day = useMemo(
    () => (program ? dayForDate(program, selectedDate) : null),
    [program, selectedDate],
  );

  const daySession = useMemo(() => {
    const sessions = weekSessions[selectedDate] ?? [];
    if (sessions.length === 0) return null;
    if (day) {
      const match = sessions.find((session) => session.dayId === day.id);
      if (match) return match;
    }
    return sessions[0];
  }, [weekSessions, selectedDate, day]);

  const stripDays = useMemo<WeekStripDay[]>(
    () =>
      week.map((date) => ({
        date,
        type: program ? (dayForDate(program, date)?.type ?? null) : null,
        completed: (weekSessions[date] ?? []).some((session) => Boolean(session.completedAt)),
      })),
    [week, program, weekSessions],
  );

  const plannedById = useMemo(() => {
    const map: Record<string, PlannedExercise> = {};
    if (day) {
      for (const planned of day.exercises) map[planned.exerciseId] = planned;
    }
    return map;
  }, [day]);

  const cardExercises = useMemo<DayCardExercise[]>(() => {
    const resolve = (exerciseId: string) => exerciseById(exerciseId, customExercises);

    if (daySession) {
      return daySession.exercises.map((exercise, index) => {
        const planned = plannedById[exercise.exerciseId];
        return {
          id: `${exercise.exerciseId}-${index}`,
          name: exercise.name,
          nameAr: resolve(exercise.exerciseId)?.nameAr,
          detail: planned
            ? plannedLabel(planned)
            : `${exercise.sets.length} ${exercise.sets.length === 1 ? 'set' : 'sets'}`,
          done: exercise.done,
        };
      });
    }

    if (!day) return [];
    return day.exercises.map((planned, index) => {
      const exercise = resolve(planned.exerciseId);
      return {
        id: `${planned.exerciseId}-${index}`,
        name: exercise?.name ?? planned.exerciseId,
        nameAr: exercise?.nameAr,
        detail: plannedLabel(planned),
      };
    });
  }, [daySession, day, plannedById, customExercises]);

  const status: DayCardStatus = daySession
    ? daySession.completedAt
      ? 'completed'
      : 'in_progress'
    : 'none';

  const primaryLabel = daySession
    ? daySession.completedAt
      ? 'Review session'
      : 'Resume session'
    : day
      ? `Start ${day.label}`
      : 'Log a session anyway';

  const openSession = useCallback(() => {
    const params: Record<string, string> = { date: selectedDate };
    if (day) params.dayId = day.id;
    router.push({ pathname: '/training/session', params });
  }, [router, selectedDate, day]);

  const openProgram = useCallback(() => {
    router.push('/training/program');
  }, [router]);

  const weekStats = useMemo(() => {
    const sessions = week.flatMap((date) => weekSessions[date] ?? []);
    const completed = week.filter((date) =>
      (weekSessions[date] ?? []).some((session) => Boolean(session.completedAt)),
    ).length;
    const scheduled = program
      ? Array.from({ length: WEEKDAYS_IN_WEEK }, (_, weekday) => program.schedule[weekday]).filter(
          (dayId) => Boolean(dayId),
        ).length
      : 0;
    return { sessions, completed, scheduled };
  }, [week, weekSessions, program]);

  const volumeRows = useMemo<VolumeRow[]>(() => {
    const volume = weeklyVolume(weekStats.sessions);
    const types: SessionType[] = [];
    if (program) {
      for (const programDay of program.days) {
        if (!types.includes(programDay.type)) types.push(programDay.type);
      }
    }
    for (const type of Object.keys(volume) as SessionType[]) {
      if (volume[type] > 0 && !types.includes(type)) types.push(type);
    }
    return types.map((type) => ({ type, sets: volume[type] }));
  }, [weekStats.sessions, program]);

  const maxVolume = volumeRows.reduce((max, row) => Math.max(max, row.sets), 0);
  const untrained = volumeRows.filter((row) => row.sets === 0).map((row) => SESSION_LABELS[row.type]);
  const streak = useMemo(() => trainingStreak(workoutDates, today), [workoutDates, today]);

  if (!ready || !program) {
    return (
      <Screen>
        <LoadingView message="Loading your program" />
      </Screen>
    );
  }

  return (
    <Screen scroll refreshing={refreshing} onRefresh={handleRefresh}>
      <AppHeader
        title="Training"
        subtitle={program.name}
        large
        right={
          <IconButton
            icon="create-outline"
            onPress={openProgram}
            accessibilityLabel="Edit program"
          />
        }
      />

      <WeekStrip
        days={stripDays}
        selectedDate={selectedDate}
        today={today}
        onSelect={setSelectedDate}
        style={styles.strip}
      />

      <DayCard
        day={day}
        dateLabel={formatDayLabel(selectedDate, today)}
        exercises={cardExercises}
        status={status}
        primaryLabel={primaryLabel}
        onPrimary={openSession}
        style={styles.dayCard}
      />

      <View style={styles.tiles}>
        <StatTile
          label="This week"
          value={`${weekStats.completed}/${weekStats.scheduled}`}
          hint="Sessions finished"
          icon="checkmark-done-outline"
          tone={weekStats.completed > 0 ? 'accent' : 'default'}
          style={styles.tile}
        />
        <StatTile
          label="Streak"
          value={streak}
          unit={streak === 1 ? 'day' : 'days'}
          hint="Days in a row"
          icon="flame-outline"
          style={styles.tile}
        />
      </View>

      {volumeRows.length > 0 ? (
        <Card style={styles.volumeCard}>
          <View style={styles.volumeHeader}>
            <Txt variant="label" weight="semibold">
              Sets by day type
            </Txt>
            <Txt variant="caption" color="faint">
              THIS WEEK
            </Txt>
          </View>

          <View style={styles.volumeList}>
            {volumeRows.map((row) => (
              <VolumeBar key={row.type} row={row} max={maxVolume} />
            ))}
          </View>

          {untrained.length > 0 ? (
            <Txt variant="label" color="muted" style={styles.volumeNote}>
              {`No sets logged yet for ${untrained.join(', ')}.`}
            </Txt>
          ) : null}
        </Card>
      ) : null}

      <Card padded={false} style={styles.programCard}>
        <ListRow
          title="Edit program"
          subtitle="Schedule, days and exercises"
          icon="calendar-outline"
          onPress={openProgram}
          chevron
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  strip: {
    marginBottom: spacing.lg,
  },
  dayCard: {
    marginBottom: spacing.lg,
  },
  tiles: {
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  tile: {
    flex: 1,
    flexBasis: 0,
  },
  volumeCard: {
    marginTop: spacing.lg,
  },
  volumeHeader: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  volumeList: {
    marginTop: spacing.md,
    rowGap: spacing.sm,
  },
  volumeRow: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    minHeight: 24,
  },
  volumeLabel: {
    width: 64,
  },
  volumeTrack: {
    borderRadius: radius.pill,
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  volumeFill: {
    borderRadius: radius.pill,
    height: '100%',
  },
  volumeValue: {
    minWidth: 22,
    textAlign: 'right',
  },
  volumeNote: {
    marginTop: spacing.md,
  },
  programCard: {
    marginTop: spacing.lg,
  },
});
