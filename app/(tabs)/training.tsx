import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { DayCard, type DayCardExercise, type DayCardStatus } from '@/components/training/DayCard';
import { WeekStrip, type WeekStripDay } from '@/components/training/WeekStrip';
import { useTrainingText } from '@/components/training/useTrainingText';
import {
  AppHeader,
  Button,
  ListRow,
  LoadingView,
  Screen,
  Section,
  StatTile,
  Txt,
} from '@/components/ui';
import { exerciseById } from '@/data/exercises';
import { todayKey } from '@/domain/date';
import { formatCount } from '@/domain/format';
import { dayForDate, trainingStreak, weekDates, weeklyVolume } from '@/domain/training';
import { useApp } from '@/state/AppStore';
import * as repo from '@/storage/repository';
import { radius, spacing, useTheme } from '@/theme';
import type { PlannedExercise, SessionType, WorkoutSession } from '@/types';

const WEEKDAYS_IN_WEEK = 7;

interface VolumeRow {
  type: SessionType;
  sets: number;
}

/**
 * Bar lengths are relative to the busiest day type, never to a fixed ceiling.
 * The bar is drawn in ink: the one accent on this screen belongs to the button
 * that starts the session.
 */
function VolumeBar({ row, max }: { row: VolumeRow; max: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation('training');
  const text = useTrainingText();

  const share = max > 0 ? row.sets / max : 0;
  const empty = row.sets === 0;
  const label = text.type(row.type);

  const spoken = empty
    ? t('volumeSpokenNone', { type: label })
    : row.sets === 1
      ? t('volumeSpokenOne', { type: label })
      : t('volumeSpoken', { type: label, sets: formatCount(row.sets) });

  return (
    <View style={styles.volumeRow} accessible accessibilityLabel={spoken}>
      <Txt
        variant="label"
        color={empty ? 'faint' : 'text'}
        style={styles.volumeLabel}
        numberOfLines={1}
      >
        {label}
      </Txt>
      <View style={[styles.volumeTrack, { backgroundColor: colors.track }]}>
        {empty ? null : (
          <View
            style={[
              styles.volumeFill,
              {
                backgroundColor: colors.textMuted,
                width: `${Math.max(Math.round(share * 100), 6)}%`,
              },
            ]}
          />
        )}
      </View>
      <Txt
        variant="label"
        color={empty ? 'faint' : 'text'}
        align="end"
        tabular
        style={styles.volumeValue}
      >
        {formatCount(row.sets)}
      </Txt>
    </View>
  );
}

/** The training week: what today holds, what is done, and where the volume went. */
export default function TrainingScreen() {
  const router = useRouter();
  const { t } = useTranslation('training');
  const text = useTrainingText();
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
        const catalogue = resolve(exercise.exerciseId);
        return {
          id: `${exercise.exerciseId}-${index}`,
          name: catalogue ? text.name(catalogue) : exercise.name,
          detail: planned ? text.plannedShort(planned) : text.sets(exercise.sets.length),
          detailSpoken: planned ? text.planned(planned) : text.sets(exercise.sets.length),
          done: exercise.done,
        };
      });
    }

    if (!day) return [];
    return day.exercises.map((planned, index) => {
      const catalogue = resolve(planned.exerciseId);
      return {
        id: `${planned.exerciseId}-${index}`,
        name: catalogue ? text.name(catalogue) : planned.exerciseId,
        detail: text.plannedShort(planned),
        detailSpoken: text.planned(planned),
      };
    });
  }, [daySession, day, plannedById, customExercises, text]);

  const status: DayCardStatus = daySession
    ? daySession.completedAt
      ? 'completed'
      : 'in_progress'
    : 'none';

  const primaryLabel = daySession
    ? daySession.completedAt
      ? t('reviewSession')
      : t('resumeSession')
    : day
      ? t('startDay', { day: text.day(day) })
      : t('logAnyway');

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
  const untrained = volumeRows.filter((row) => row.sets === 0).map((row) => text.type(row.type));
  const streak = useMemo(() => trainingStreak(workoutDates, today), [workoutDates, today]);

  if (!ready || !program) {
    return (
      <Screen>
        <LoadingView message={t('loading')} />
      </Screen>
    );
  }

  return (
    <Screen scroll refreshing={refreshing} onRefresh={handleRefresh}>
      <AppHeader title={t('title')} subtitle={text.program(program)} large />

      <WeekStrip
        days={stripDays}
        selectedDate={selectedDate}
        today={today}
        onSelect={setSelectedDate}
        style={styles.strip}
      />

      {selectedDate !== today ? (
        <View style={styles.jump}>
          <Button
            label={t('backToToday')}
            onPress={() => setSelectedDate(today)}
            variant="ghost"
            size="sm"
            accessibilityHint={t('backToTodayHint')}
          />
        </View>
      ) : null}

      <Section>
        <DayCard
          day={day}
          dateLabel={text.date(selectedDate, today)}
          exercises={cardExercises}
          status={status}
          primaryLabel={primaryLabel}
          onPrimary={openSession}
        />
      </Section>

      <Section>
        <View style={styles.tiles}>
          <StatTile
            label={t('weekTile')}
            value={`${formatCount(weekStats.completed)}/${formatCount(weekStats.scheduled)}`}
            style={styles.tile}
          />
          <StatTile
            label={t('streakTile')}
            value={formatCount(streak)}
            unit={streak === 1 ? t('unitDay') : t('unitDays')}
            style={styles.tile}
          />
        </View>
      </Section>

      {volumeRows.length > 0 ? (
        <Section title={t('volumeTitle')} subtitle={t('volumeCaption')}>
          {/* A week with nothing in it says so in one line. Seven empty tracks
              under a list of every day type would be a drawing of nothing. */}
          {maxVolume === 0 ? (
            <Txt variant="label" color="muted">
              {t('volumeEmpty')}
            </Txt>
          ) : (
            <>
              <View style={styles.volumeList}>
                {volumeRows.map((row) => (
                  <VolumeBar key={row.type} row={row} max={maxVolume} />
                ))}
              </View>

              {untrained.length > 0 ? (
                <Txt variant="label" color="muted" style={styles.volumeNote}>
                  {t('volumeNote', { types: text.list(untrained) })}
                </Txt>
              ) : null}
            </>
          )}
        </Section>
      ) : null}

      <Section divider>
        <ListRow
          title={t('editProgram')}
          subtitle={t('editProgramSubtitle')}
          onPress={openProgram}
          chevron
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  strip: {
    marginTop: spacing.xs,
  },
  // The jump back sits with the strip it belongs to, not with the day below it.
  // The negative start pulls the ghost button's own padding back so its label
  // begins on the same line of type as everything else on the screen.
  jump: {
    alignItems: 'flex-start',
    marginStart: -spacing.lg,
    marginTop: spacing.sm,
  },
  tiles: {
    columnGap: spacing.xl,
    flexDirection: 'row',
  },
  tile: {
    flex: 1,
    flexBasis: 0,
  },
  volumeList: {
    rowGap: spacing.md,
  },
  volumeRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 22,
  },
  volumeLabel: {
    width: 76,
  },
  volumeTrack: {
    borderRadius: radius.pill,
    flex: 1,
    height: 6,
    overflow: 'hidden',
  },
  volumeFill: {
    borderRadius: radius.pill,
    height: '100%',
  },
  volumeValue: {
    minWidth: 22,
  },
  volumeNote: {
    marginTop: spacing.lg,
  },
});
