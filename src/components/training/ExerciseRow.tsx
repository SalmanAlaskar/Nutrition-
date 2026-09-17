import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Button, Divider, IconButton, NumberField, Txt } from '@/components/ui';
import { MUSCLE_LABELS } from '@/data/exercises';
import { radius, spacing, useTheme } from '@/theme';
import type { Equipment, Exercise, PlannedExercise, SetLog } from '@/types';

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

const TICK_SIZE = 44;
const MAX_REPS = 500;
const MAX_WEIGHT_KG = 500;

/** Display names for the kit an exercise needs. */
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  other: 'Other',
};

/** How many muscles a meta line names before it gets too long to read. */
const META_MUSCLES = 3;

/** 'Chest, triceps · Barbell', the one-line description of an exercise. */
export function exerciseMeta(exercise: Exercise): string {
  const muscles = exercise.muscles
    .slice(0, META_MUSCLES)
    .map((muscle) => MUSCLE_LABELS[muscle] ?? muscle);
  const parts = muscles.length > 0 ? [muscles.join(', ')] : [];
  parts.push(EQUIPMENT_LABELS[exercise.equipment]);
  return parts.join(' · ');
}

/** '4 sets · 5-8 reps', or '4 sets · 8 reps' when the range is a single number. */
export function plannedLabel(planned: PlannedExercise): string {
  const sets = `${planned.sets} ${planned.sets === 1 ? 'set' : 'sets'}`;
  const reps =
    planned.repsLow === planned.repsHigh
      ? `${planned.repsLow}`
      : `${planned.repsLow}-${planned.repsHigh}`;
  return `${sets} · ${reps} reps`;
}

export interface ExerciseRowProps {
  name: string;
  nameAr?: string;
  /** Muscles and kit, e.g. 'Chest, triceps · Barbell'. */
  meta?: string;
  /** Planned volume from the program, e.g. '4 sets · 5-8 reps'. */
  planned?: string;
  done: boolean;
  onToggleDone: () => void;
  sets: SetLog[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onChangeSet: (index: number, patch: Partial<SetLog>) => void;
  onAddSet: () => void;
  onRemoveSet: (index: number) => void;
  onRemove: () => void;
  style?: StyleProp<ViewStyle>;
}

function filledSets(sets: SetLog[]): number {
  return sets.filter((set) => set.reps !== undefined || set.weightKg !== undefined).length;
}

/**
 * One exercise inside a session. Ticking it is a single tap and is all the
 * logging that is ever required; reps and load live behind the expander.
 */
export function ExerciseRow({
  name,
  nameAr,
  meta,
  planned,
  done,
  onToggleDone,
  sets,
  expanded,
  onToggleExpanded,
  onChangeSet,
  onAddSet,
  onRemoveSet,
  onRemove,
  style,
}: ExerciseRowProps) {
  const { colors } = useTheme();

  const logged = filledSets(sets);
  const detail = [planned, logged > 0 ? `${logged} of ${sets.length} logged` : null]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  const handleToggle = () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => undefined);
    }
    onToggleDone();
  };

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: done ? colors.accentSoft : colors.surface,
          borderColor: done ? colors.accent : colors.border,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        <Pressable
          onPress={handleToggle}
          accessibilityRole="checkbox"
          accessibilityLabel={name}
          accessibilityHint="Marks the exercise done"
          accessibilityState={{ checked: done }}
          style={({ pressed }) => [styles.tick, pressed ? styles.pressed : null]}
        >
          <View
            style={[
              styles.tickDisc,
              {
                backgroundColor: done ? colors.accent : 'transparent',
                borderColor: done ? colors.accent : colors.border,
              },
            ]}
            {...DECORATIVE}
          >
            <Ionicons
              name="checkmark"
              size={18}
              color={done ? colors.accentText : colors.textFaint}
            />
          </View>
        </Pressable>

        <View style={styles.text}>
          <Txt weight="semibold" numberOfLines={1}>
            {name}
          </Txt>
          {nameAr ? (
            <Txt variant="caption" color="faint" numberOfLines={1} style={styles.line}>
              {nameAr}
            </Txt>
          ) : null}
          {detail ? (
            <Txt variant="label" color="muted" numberOfLines={1} style={styles.line}>
              {detail}
            </Txt>
          ) : null}
          {meta ? (
            <Txt variant="caption" color="faint" numberOfLines={1} style={styles.line}>
              {meta}
            </Txt>
          ) : null}
        </View>

        <IconButton
          icon={expanded ? 'chevron-up' : 'chevron-down'}
          onPress={onToggleExpanded}
          accessibilityLabel={expanded ? `Hide sets for ${name}` : `Show sets for ${name}`}
          size={18}
        />
      </View>

      {expanded ? (
        <View style={styles.details}>
          <Divider style={styles.divider} />

          {/* The fields are too narrow to carry their own unit, so the columns
              are named once at the top instead. */}
          <View style={styles.setHeader} {...DECORATIVE}>
            <View style={styles.setLabel} />
            <Txt variant="caption" color="faint" weight="bold" style={styles.field}>
              REPS
            </Txt>
            <Txt variant="caption" color="faint" weight="bold" style={styles.field}>
              KG
            </Txt>
            <View style={styles.headerSpacer} />
          </View>

          {sets.map((set, index) => (
            <View key={index} style={styles.setRow}>
              <Txt variant="label" color="muted" weight="semibold" style={styles.setLabel}>
                {`Set ${index + 1}`}
              </Txt>
              <NumberField
                value={set.reps ?? null}
                onChange={(reps) => onChangeSet(index, { reps: reps ?? undefined })}
                placeholder="Reps"
                min={0}
                max={MAX_REPS}
                style={styles.field}
              />
              <NumberField
                value={set.weightKg ?? null}
                onChange={(weightKg) => onChangeSet(index, { weightKg: weightKg ?? undefined })}
                placeholder="Load"
                suffix="kg"
                min={0}
                max={MAX_WEIGHT_KG}
                style={styles.field}
              />
              <IconButton
                icon="close"
                onPress={() => onRemoveSet(index)}
                accessibilityLabel={`Remove set ${index + 1} of ${name}`}
                size={16}
              />
            </View>
          ))}

          <View style={styles.actions}>
            <Button
              label="Add set"
              onPress={onAddSet}
              variant="secondary"
              size="sm"
              icon="add"
              accessibilityHint={`Adds a set to ${name}`}
            />
            <Button
              label="Remove"
              onPress={onRemove}
              variant="danger"
              size="sm"
              icon="trash-outline"
              accessibilityHint={`Removes ${name} from this session`}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  row: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  tick: {
    alignItems: 'center',
    height: TICK_SIZE,
    justifyContent: 'center',
    width: TICK_SIZE,
  },
  tickDisc: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    flex: 1,
  },
  line: {
    marginTop: 2,
  },
  details: {
    marginTop: spacing.sm,
  },
  divider: {
    marginBottom: spacing.md,
  },
  setHeader: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  headerSpacer: {
    width: 44,
  },
  setRow: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  setLabel: {
    width: 44,
  },
  field: {
    flex: 1,
    flexBasis: 0,
  },
  actions: {
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
});
