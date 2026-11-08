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

/** The tick is the one thing that has to be hit without looking, standing up. */
const TICK_SIZE = 56;
const TICK_DISC = 38;
const MAX_REPS = 500;
const MAX_WEIGHT_KG = 500;

/** Between two facts on one line. Punctuation, so it is the same in both languages. */
const SEPARATOR = ' · ';

export interface ExerciseRowProps {
  /** Leading name, already in the reading language. */
  name: string;
  /** The other name, shown quietly once the row is open. */
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
 * One exercise inside a session. Collapsed it says three things — name, planned
 * volume, done or not — so the list scans at a glance; reps, load, the other
 * name and the form cue all stay behind the expander until they are wanted.
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
    .join(SEPARATOR);

  const about = [altName, meta].filter((part): part is string => Boolean(part)).join(SEPARATOR);

  const handleToggle = () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => undefined);
    }
    onToggleDone();
  };

  return (
    <View style={[styles.wrapper, style]}>
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
                borderColor: done ? colors.accent : colors.borderStrong,
              },
            ]}
            {...DECORATIVE}
          >
            {done ? <Ionicons name="checkmark" size={22} color={colors.accentText} /> : null}
          </View>
        </Pressable>

        {/* One target for the whole text block and its chevron: a disclosure
            arrow beside a tappable title would be a second way to do one thing. */}
        <Pressable
          onPress={onToggleExpanded}
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? t('training:hideSets', { name }) : t('training:showSets', { name })
          }
          accessibilityState={{ expanded }}
          style={({ pressed }) => [styles.main, pressed ? styles.pressed : null]}
        >
          <View style={styles.text}>
            <Txt weight="medium" numberOfLines={2}>
              {name}
            </Txt>
            {detail ? (
              <Txt variant="label" color="muted" numberOfLines={1} tabular style={styles.line}>
                {detail}
              </Txt>
            ) : null}
          </View>
          <View style={styles.chevron} {...DECORATIVE}>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textFaint}
            />
          </View>
        </Pressable>
      </View>

      {expanded ? (
        <View style={styles.details}>
          <Divider style={styles.divider} />

          {about ? (
            <Txt variant="label" color="faint" numberOfLines={2} style={styles.about}>
              {about}
            </Txt>
          ) : null}

          {cue ? (
            <Txt
              variant="label"
              color="muted"
              style={styles.cue}
              accessibilityLabel={`${t('training:cueLabel')}: ${cue}`}
            >
              {cue}
            </Txt>
          ) : null}

          {/* The fields are too narrow to carry their own unit, so the columns
              are named once at the top instead. */}
          <View style={styles.setHeader} {...DECORATIVE}>
            <View style={styles.setLabel} />
            <Txt variant="caption" color="faint" style={styles.field}>
              {t('training:colReps')}
            </Txt>
            <Txt variant="caption" color="faint" style={styles.field}>
              {t('training:colLoad')}
            </Txt>
            <View style={styles.headerSpacer} />
          </View>

          {sets.map((set, index) => (
            <View key={index} style={styles.setRow}>
              <Txt variant="label" color="muted" numberOfLines={1} style={styles.setLabel}>
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
                color={colors.textFaint}
              />
            </View>
          ))}

          <View style={styles.actions}>
            <Button
              label={t('training:addSet')}
              onPress={onAddSet}
              variant="secondary"
              size="sm"
              accessibilityHint={t('training:addSetHint', { name })}
            />
            <Button
              label={t('common:remove')}
              onPress={onRemove}
              variant="danger"
              size="sm"
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
    paddingVertical: spacing.xs,
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
    marginStart: -spacing.sm,
    width: TICK_SIZE,
  },
  tickDisc: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    height: TICK_DISC,
    justifyContent: 'center',
    width: TICK_DISC,
  },
  pressed: {
    opacity: 0.7,
  },
  main: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flex: 1,
    flexDirection: 'row',
    minHeight: TICK_SIZE,
    paddingVertical: spacing.xs,
  },
  text: {
    flex: 1,
  },
  line: {
    marginTop: 3,
  },
  chevron: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
  },
  details: {
    marginTop: spacing.sm,
  },
  divider: {
    marginBottom: spacing.lg,
  },
  about: {
    marginBottom: spacing.sm,
  },
  cue: {
    marginBottom: spacing.lg,
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
    marginTop: spacing.sm,
  },
});
