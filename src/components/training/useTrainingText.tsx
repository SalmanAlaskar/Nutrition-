/**
 * Every piece of training copy that depends on the user's data rather than on
 * one screen: day types, weekday names, exercise names, the planned-volume
 * line. Screens still call useTranslation for their own strings; this keeps the
 * shared wording identical wherever it appears.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  EQUIPMENT_KEYS,
  MUSCLE_KEYS,
  exerciseAltName,
  exerciseCue,
  exerciseName,
} from '@/data/exercises';
import { addDays, parseDateKey, todayKey } from '@/domain/date';
import { formatCount } from '@/domain/format';
import {
  MONTH_KEYS,
  SESSION_LABEL_KEYS,
  SESSION_MUSCLE_KEYS,
  WEEKDAY_LETTER_KEYS,
  WEEKDAY_LONG_KEYS,
  WEEKDAY_SHORT_KEYS,
  programDayLabel,
  programTitle,
} from '@/domain/training';
import { useDirection } from '@/i18n';
import type {
  Equipment,
  Exercise,
  PlannedExercise,
  Program,
  ProgramDay,
  SessionType,
} from '@/types';

/** How many muscles a meta line names before it gets too long to read. */
const META_MUSCLES = 3;

/** Between two facts on one line. Punctuation, so it is the same in both languages. */
const SEPARATOR = ' · ';

export interface TrainingText {
  /** 'Push', 'دفع'. */
  type: (type: SessionType) => string;
  /** The muscles a day type is built around. */
  muscles: (type: SessionType) => string;
  /** The day's own label, which the user may have renamed. */
  day: (day: ProgramDay) => string;
  program: (program: Program) => string;
  /** Leading name of an exercise, Arabic first in Arabic. */
  name: (exercise: Exercise) => string;
  /** The other name, for the quiet second line. */
  altName: (exercise: Exercise) => string | undefined;
  /** One sentence on form, when the catalogue has one. */
  cue: (exercise: Exercise) => string | undefined;
  /** 'Chest, triceps · Barbell'. */
  meta: (exercise: Exercise) => string;
  /** The kit one exercise needs, on its own. */
  equipment: (kind: Equipment) => string;
  /** '4 sets · 5-8 reps'. */
  planned: (planned: PlannedExercise) => string;
  /** '4×5-8', for a dense list where the words would crowd out the name. */
  plannedShort: (planned: PlannedExercise) => string;
  /** '3 sets', for a session line with no plan behind it. */
  sets: (count: number) => string;
  /** '6 exercises'. */
  exercises: (count: number) => string;
  /** Single letter under a weekday in the strip. */
  weekdayLetter: (date: string) => string;
  /** 'Sun', for the schedule editor. */
  weekdayShort: (weekday: number) => string;
  /** 'Sunday', for anything spoken. */
  weekdayLong: (weekday: number) => string;
  /** 'Today', 'Yesterday', or 'Sunday, 14 Sep'. */
  date: (date: string, today?: string) => string;
  /** Joins a short list the way the language punctuates one. */
  list: (parts: string[]) => string;
}

export function useTrainingText(): TrainingText {
  const { t } = useTranslation(['training', 'common']);
  const { language } = useDirection();

  return useMemo<TrainingText>(() => {
    const list = (parts: string[]): string =>
      parts.reduce((joined, part) =>
        joined ? t('common:joinList', { a: joined, b: part }) : part,
      '');

    const name = (exercise: Exercise) => exerciseName(exercise, language);

    const reps = (planned: PlannedExercise) =>
      planned.repsLow === planned.repsHigh
        ? formatCount(planned.repsLow)
        : `${formatCount(planned.repsLow)}-${formatCount(planned.repsHigh)}`;

    const sets = (count: number) =>
      count === 1
        ? t('training:setsCountOne')
        : t('training:setsCount', { sets: formatCount(count) });

    return {
      type: (type) => t(SESSION_LABEL_KEYS[type]),
      muscles: (type) => t(SESSION_MUSCLE_KEYS[type]),
      day: (day) => programDayLabel(day, language),
      program: (program) => programTitle(program, language),
      name,
      altName: (exercise) => exerciseAltName(exercise, language),
      cue: (exercise) => exerciseCue(exercise, language),
      meta: (exercise) => {
        const muscles = exercise.muscles
          .slice(0, META_MUSCLES)
          .map((muscle) => {
            const key = MUSCLE_KEYS[muscle as keyof typeof MUSCLE_KEYS];
            return key ? t(key) : muscle;
          });
        const parts = muscles.length > 0 ? [list(muscles)] : [];
        parts.push(t(EQUIPMENT_KEYS[exercise.equipment]));
        return parts.join(SEPARATOR);
      },
      equipment: (kind) => t(EQUIPMENT_KEYS[kind]),
      planned: (planned) =>
        `${sets(planned.sets)}${SEPARATOR}${t('training:repsRange', { reps: reps(planned) })}`,
      plannedShort: (planned) => `${formatCount(planned.sets)}×${reps(planned)}`,
      sets,
      exercises: (count) =>
        count === 1
          ? t('training:exerciseCountOne')
          : t('training:exerciseCount', { total: formatCount(count) }),
      weekdayLetter: (date) => t(WEEKDAY_LETTER_KEYS[parseDateKey(date).getDay()]),
      weekdayShort: (weekday) => t(WEEKDAY_SHORT_KEYS[weekday]),
      weekdayLong: (weekday) => t(WEEKDAY_LONG_KEYS[weekday]),
      date: (date, today) => {
        const anchor = today ?? todayKey();
        if (date === anchor) return t('common:today');
        if (date === addDays(anchor, -1)) return t('common:yesterday');
        if (date === addDays(anchor, 1)) return t('common:tomorrow');
        const value = parseDateKey(date);
        return t('training:dateWeekday', {
          weekday: t(WEEKDAY_LONG_KEYS[value.getDay()]),
          day: formatCount(value.getDate()),
          month: t(MONTH_KEYS[value.getMonth()]),
        });
      },
      list,
    };
  }, [t, language]);
}
