import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { useTranslation } from 'react-i18next';
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
import { formatCount } from '@/domain/format';
import { radius, spacing, useTheme } from '@/theme';
import type { SetLog } from '@/types';

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

/** The tick is the one thing that has to be hit without looking. */
const TICK_SIZE = 52;
const MAX_REPS = 500;
const MAX_WEIGHT_KG = 500;

export interface ExerciseRowProps {
  /** Leading name, already in the reading language. */
  name: string;
  /** The other name, shown quietly underneath. */
  altName?: string;
  /** Muscles and kit, e.g. 'Chest, triceps · Barbell'. */
  meta?: string;
  /** Planned volume from the program, e.g. '4 sets · 5-8 reps'. */
  planned?: string;
  /** One sentence on form, shown once the row is open. */
  cue?: string;
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
  altName,
  meta,
  planned,
  cue,
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
  const { t } = useTranslation(['training', 'common', 'units']);

  const logged = filledSets(sets);
  const detail = [
    planned,
    logged > 0
      ? t('training:loggedOf', {
          logged: formatCount(logged),
          total: formatCount(sets.length),
        })
      : null,
  ]
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
          accessibilityHint={t('training:tickHint')}
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
              size={20}
              color={done ? colors.accentText : colors.textFaint}
            />
          </View>
        </Pressable>

        <View style={styles.text}>
          <Txt weight="semibold" numberOfLines={2}>
            {name}
          </Txt>
          {altName ? (
            <Txt variant="caption" color="faint" numberOfLines={1} style={styles.line}>
              {altName}
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
          accessibilityLabel={
            expanded ? t('training:hideSets', { name }) : t('training:showSets', { name })
          }
          size={18}
        />
      </View>

      {expanded ? (
        <View style={styles.details}>
          <Divider style={styles.divider} />

          {cue ? (
            <View style={[styles.cue, { backgroundColor: colors.surfaceAlt }]}>
              <Txt variant="caption" color="faint" weight="bold">
                {t('training:cueLabel').toUpperCase()}
              </Txt>
              <Txt variant="label" color="muted" style={styles.cueText}>
                {cue}
              </Txt>
            </View>
          ) : null}

          {/* The fields are too narrow to carry their own unit, so the columns
              are named once at the top instead. */}
          <View style={styles.setHeader} {...DECORATIVE}>
            <View style={styles.setLabel} />
            <Txt variant="caption" color="faint" weight="bold" style={styles.field}>
              {t('training:colReps').toUpperCase()}
            </Txt>
            <Txt variant="caption" color="faint" weight="bold" style={styles.field}>
              {t('training:colLoad').toUpperCase()}
            </Txt>
            <View style={styles.headerSpacer} />
          </View>

          {sets.map((set, index) => (
            <View key={index} style={styles.setRow}>
              <Txt
                variant="label"
                color="muted"
                weight="semibold"
                numberOfLines={1}
                style={styles.setLabel}
              >
                {t('training:setNumber', { number: formatCount(index + 1) })}
              </Txt>
              <NumberField
                value={set.reps ?? null}
                onChange={(reps) => onChangeSet(index, { reps: reps ?? undefined })}
                placeholder={t('training:repsPlaceholder')}
                min={0}
                max={MAX_REPS}
                style={styles.field}
              />
              <NumberField
                value={set.weightKg ?? null}
                onChange={(weightKg) => onChangeSet(index, { weightKg: weightKg ?? undefined })}
                placeholder={t('training:loadPlaceholder')}
                suffix={t('units:kg')}
                min={0}
                max={MAX_WEIGHT_KG}
                style={styles.field}
              />
              <IconButton
                icon="close"
                onPress={() => onRemoveSet(index)}
                accessibilityLabel={t('training:removeSet', {
                  number: formatCount(index + 1),
                  name,
                })}
                size={16}
              />
            </View>
          ))}

          <View style={styles.actions}>
            <Button
              label={t('training:addSet')}
              onPress={onAddSet}
              variant="secondary"
              size="sm"
              icon="add"
              accessibilityHint={t('training:addSetHint', { name })}
            />
            <Button
              label={t('common:remove')}
              onPress={onRemove}
              variant="danger"
              size="sm"
              icon="trash-outline"
              accessibilityHint={t('training:removeExerciseHint', { name })}
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
    marginStart: -spacing.xs,
    width: TICK_SIZE,
  },
  tickDisc: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    height: 34,
    justifyContent: 'center',
    width: 34,
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
  cue: {
    borderRadius: radius.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cueText: {
    marginTop: 2,
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
    width: 58,
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
