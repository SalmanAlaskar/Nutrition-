import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EQUIPMENT_LABELS, exerciseMeta } from '@/components/training/ExerciseRow';
import {
  AppHeader,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ListRow,
  Screen,
  TextField,
  Txt,
} from '@/components/ui';
import { searchExercises } from '@/data/exercises';
import { makeId } from '@/domain/id';
import { SESSION_LABELS } from '@/domain/training';
import { useApp } from '@/state/AppStore';
import { spacing, useTheme } from '@/theme';
import type { Equipment, Exercise, SessionType } from '@/types';

const SEARCH_DEBOUNCE_MS = 120;
const RESULT_LIMIT = 40;
const NAME_MAX = 60;

const SESSION_TYPES = Object.keys(SESSION_LABELS) as SessionType[];
const EQUIPMENT_KINDS = Object.keys(EQUIPMENT_LABELS) as Equipment[];

type TypeFilter = SessionType | 'all';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readType(value: string | undefined): SessionType | undefined {
  return SESSION_TYPES.find((type) => type === value);
}

interface ResultRowProps {
  exercise: Exercise;
  custom: boolean;
  onPress: (exercise: Exercise) => void;
}

/** One search hit: what it is called, what it works and what it needs. */
function ResultRow({ exercise, custom, onPress }: ResultRowProps) {
  const { colors } = useTheme();
  const meta = exerciseMeta(exercise);

  return (
    <Pressable
      onPress={() => onPress(exercise)}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}. ${meta}${custom ? '. Your own exercise' : ''}`}
      accessibilityHint="Adds it and goes back"
      style={({ pressed }) => [styles.result, pressed ? { backgroundColor: colors.surfaceAlt } : null]}
    >
      <View style={styles.resultText}>
        <View style={styles.resultTitle}>
          <Txt weight="semibold" numberOfLines={1} style={styles.resultName}>
            {exercise.name}
          </Txt>
          {custom ? <Badge label="Yours" tone="accent" /> : null}
        </View>
        {exercise.nameAr ? (
          <Txt variant="label" color="muted" numberOfLines={1} style={styles.resultLine}>
            {exercise.nameAr}
          </Txt>
        ) : null}
        <Txt variant="caption" color="faint" numberOfLines={1} style={styles.resultLine}>
          {meta}
        </Txt>
      </View>
    </Pressable>
  );
}

/** Search the exercise catalogue, or define your own, and hand it back. */
export default function ExercisePickerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { customExercises, saveCustomExercise } = useApp();

  const returnTo = firstParam(params.returnTo) === 'program' ? 'program' : 'session';
  const date = firstParam(params.date);
  const dayId = firstParam(params.dayId);
  const dayType = readType(firstParam(params.type));

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<TypeFilter>(dayType ?? 'all');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [customType, setCustomType] = useState<SessionType>(dayType ?? 'push');
  const [equipment, setEquipment] = useState<Equipment>('barbell');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const results = useMemo(
    () =>
      searchExercises(debouncedQuery, {
        extra: customExercises,
        type: filter === 'all' ? undefined : filter,
        limit: RESULT_LIMIT,
      }),
    [debouncedQuery, customExercises, filter],
  );

  const customIds = useMemo(
    () => new Set(customExercises.map((exercise) => exercise.id)),
    [customExercises],
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/training');
  }, [router]);

  const choose = useCallback(
    (exercise: Exercise) => {
      // A fresh token every time, so picking the same exercise twice in a row
      // still reads as two separate picks on the screen that receives it.
      const next: Record<string, string> = { addExerciseId: exercise.id, pick: makeId('pick') };
      if (dayId) next.dayId = dayId;

      // dismissTo pops back to the screen that is already mounted and hands it
      // these params; a replace would stack a second copy of it instead.
      if (returnTo === 'program') {
        router.dismissTo({ pathname: '/training/program', params: next });
        return;
      }
      if (date) next.date = date;
      router.dismissTo({ pathname: '/training/session', params: next });
    },
    [router, returnTo, date, dayId],
  );

  const saveCustom = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setNameError('Give the exercise a name.');
      return;
    }
    setSaving(true);
    setNameError(null);
    setSaveError(null);

    const exercise: Exercise = {
      id: makeId('ex'),
      name: trimmed,
      nameAr: nameAr.trim() || undefined,
      types: [customType],
      muscles: [],
      equipment,
      custom: true,
    };

    try {
      await saveCustomExercise(exercise);
      choose(exercise);
    } catch {
      setSaving(false);
      setSaveError('Could not save this exercise. Please try again.');
    }
  }, [name, nameAr, customType, equipment, saveCustomExercise, choose]);

  const trimmedQuery = debouncedQuery.trim();

  if (creating) {
    return (
      <Screen scroll keyboardAvoiding edges={['top', 'bottom']}>
        <AppHeader
          title="New exercise"
          subtitle="Saved for every future session"
          onBack={() => {
            setCreating(false);
            setNameError(null);
            setSaveError(null);
          }}
        />

        <Card>
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Cable pullover"
            maxLength={NAME_MAX}
            autoCapitalize="words"
            error={nameError ?? undefined}
          />

          <TextField
            label="Arabic name"
            value={nameAr}
            onChangeText={setNameAr}
            placeholder="اسم التمرين"
            maxLength={NAME_MAX}
            autoCapitalize="none"
            hint="Optional, shown under the English name."
            style={styles.field}
          />

          <Txt variant="label" color="muted" weight="semibold" style={styles.groupLabel}>
            Day type
          </Txt>
          <View style={styles.chipWrap}>
            {SESSION_TYPES.map((type) => (
              <Chip
                key={type}
                label={SESSION_LABELS[type]}
                selected={customType === type}
                onPress={() => setCustomType(type)}
              />
            ))}
          </View>

          <Txt variant="label" color="muted" weight="semibold" style={styles.groupLabel}>
            Equipment
          </Txt>
          <View style={styles.chipWrap}>
            {EQUIPMENT_KINDS.map((kind) => (
              <Chip
                key={kind}
                label={EQUIPMENT_LABELS[kind]}
                selected={equipment === kind}
                onPress={() => setEquipment(kind)}
              />
            ))}
          </View>

          {saveError ? (
            <Txt variant="label" color="danger" style={styles.saveError}>
              {saveError}
            </Txt>
          ) : null}

          <Button
            label="Save and add"
            icon="checkmark"
            onPress={() => void saveCustom()}
            loading={saving}
            fullWidth
            style={styles.save}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen padded={false} keyboardAvoiding>
      <View style={styles.top}>
        <AppHeader title="Add exercise" onBack={goBack} />

        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises in English or Arabic"
          icon="search"
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.filterStrip}
        contentContainerStyle={styles.filters}
      >
        <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        {SESSION_TYPES.map((type) => (
          <Chip
            key={type}
            label={SESSION_LABELS[type]}
            selected={filter === type}
            onPress={() => setFilter(type)}
          />
        ))}
      </ScrollView>

      <FlatList
        data={results}
        style={styles.list}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <Divider inset />}
        renderItem={({ item }) => (
          <ResultRow exercise={item} custom={customIds.has(item.id)} onPress={choose} />
        )}
        ListEmptyComponent={
          <EmptyState
            icon={trimmedQuery ? 'search-outline' : 'barbell-outline'}
            title={trimmedQuery ? 'No match found' : 'Nothing in this filter'}
            message={
              trimmedQuery
                ? `Nothing in the catalogue matches “${trimmedQuery}”. Add it once and it stays searchable.`
                : 'Pick another day type, or add your own exercise.'
            }
            actionLabel="Create an exercise"
            onAction={() => {
              setName(trimmedQuery);
              setCreating(true);
            }}
            style={styles.empty}
          />
        }
        ListFooterComponent={
          results.length > 0 ? (
            <Card padded={false} style={styles.customCard}>
              <ListRow
                title="Create an exercise"
                subtitle={
                  trimmedQuery
                    ? `Add “${trimmedQuery}” with your own name`
                    : 'Add something the catalogue does not have'
                }
                icon="add-circle-outline"
                onPress={() => {
                  setName(trimmedQuery);
                  setCreating(true);
                }}
                chevron
              />
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    paddingHorizontal: spacing.lg,
  },
  filterStrip: {
    flexGrow: 0,
    marginTop: spacing.md,
  },
  filters: {
    columnGap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  list: {
    flex: 1,
    marginTop: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  result: {
    justifyContent: 'center',
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  resultText: {
    flex: 1,
  },
  resultTitle: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  resultName: {
    flexShrink: 1,
  },
  resultLine: {
    marginTop: 2,
  },
  empty: {
    paddingTop: spacing.xxl,
  },
  customCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  field: {
    marginTop: spacing.lg,
  },
  groupLabel: {
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  chipWrap: {
    columnGap: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
  },
  saveError: {
    marginTop: spacing.lg,
  },
  save: {
    marginTop: spacing.xl,
  },
});
