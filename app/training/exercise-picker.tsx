import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTrainingText } from '@/components/training/useTrainingText';
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
import { EQUIPMENT_KEYS, searchExercises } from '@/data/exercises';
import { makeId } from '@/domain/id';
import { SESSION_LABEL_KEYS } from '@/domain/training';
import { useApp } from '@/state/AppStore';
import { spacing, useTheme } from '@/theme';
import type { Equipment, Exercise, SessionType } from '@/types';

const SEARCH_DEBOUNCE_MS = 120;
const RESULT_LIMIT = 40;
const NAME_MAX = 60;

const SESSION_TYPES = Object.keys(SESSION_LABEL_KEYS) as SessionType[];
const EQUIPMENT_KINDS = Object.keys(EQUIPMENT_KEYS) as Equipment[];

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
  const { t } = useTranslation('training');
  const text = useTrainingText();

  const name = text.name(exercise);
  const altName = text.altName(exercise);
  const meta = text.meta(exercise);

  return (
    <Pressable
      onPress={() => onPress(exercise)}
      accessibilityRole="button"
      accessibilityLabel={
        custom ? t('resultSpokenCustom', { name, meta }) : t('resultSpoken', { name, meta })
      }
      accessibilityHint={t('resultHint')}
      style={({ pressed }) => [
        styles.result,
        pressed ? { backgroundColor: colors.surfaceAlt } : null,
      ]}
    >
      <View style={styles.resultText}>
        <View style={styles.resultTitle}>
          <Txt weight="semibold" numberOfLines={1} style={styles.resultName}>
            {name}
          </Txt>
          {custom ? <Badge label={t('badgeCustom')} tone="accent" /> : null}
        </View>
        {altName ? (
          <Txt variant="label" color="muted" numberOfLines={1} style={styles.resultLine}>
            {altName}
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
  const { t } = useTranslation('training');
  const text = useTrainingText();
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
      setNameError(t('nameRequired'));
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
      setSaveError(t('exerciseSaveFailed'));
    }
  }, [name, nameAr, customType, equipment, saveCustomExercise, choose, t]);

  const trimmedQuery = debouncedQuery.trim();

  const startCreating = useCallback(() => {
    setName(trimmedQuery);
    setCreating(true);
  }, [trimmedQuery]);

  if (creating) {
    return (
      <Screen scroll keyboardAvoiding edges={['top', 'bottom']}>
        <AppHeader
          title={t('newTitle')}
          subtitle={t('newSubtitle')}
          onBack={() => {
            setCreating(false);
            setNameError(null);
            setSaveError(null);
          }}
        />

        <Card>
          <TextField
            label={t('nameEnglish')}
            value={name}
            onChangeText={setName}
            placeholder={t('nameEnglishPlaceholder')}
            maxLength={NAME_MAX}
            autoCapitalize="words"
            error={nameError ?? undefined}
          />

          <TextField
            label={t('nameArabic')}
            value={nameAr}
            onChangeText={setNameAr}
            placeholder={t('nameArabicPlaceholder')}
            maxLength={NAME_MAX}
            autoCapitalize="none"
            hint={t('nameArabicHint')}
            style={styles.field}
          />

          <Txt variant="label" color="muted" weight="semibold" style={styles.groupLabel}>
            {t('groupDayType')}
          </Txt>
          <View style={styles.chipWrap}>
            {SESSION_TYPES.map((type) => (
              <Chip
                key={type}
                label={text.type(type)}
                selected={customType === type}
                onPress={() => setCustomType(type)}
              />
            ))}
          </View>

          <Txt variant="label" color="muted" weight="semibold" style={styles.groupLabel}>
            {t('groupEquipment')}
          </Txt>
          <View style={styles.chipWrap}>
            {EQUIPMENT_KINDS.map((kind) => (
              <Chip
                key={kind}
                label={text.equipment(kind)}
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
            label={t('saveAndAdd')}
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
        <AppHeader title={t('pickerTitle')} onBack={goBack} />

        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={t('searchPlaceholder')}
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
        <Chip label={t('filterAll')} selected={filter === 'all'} onPress={() => setFilter('all')} />
        {SESSION_TYPES.map((type) => (
          <Chip
            key={type}
            label={text.type(type)}
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
            title={trimmedQuery ? t('noMatchTitle') : t('emptyFilterTitle')}
            message={
              trimmedQuery ? t('noMatchMessage', { query: trimmedQuery }) : t('emptyFilterMessage')
            }
            actionLabel={t('createExercise')}
            onAction={startCreating}
            style={styles.empty}
          />
        }
        ListFooterComponent={
          results.length > 0 ? (
            <Card padded={false} style={styles.customCard}>
              <ListRow
                title={t('createExercise')}
                subtitle={
                  trimmedQuery ? t('createWithQuery', { query: trimmedQuery }) : t('createSubtitle')
                }
                icon="add-circle-outline"
                onPress={startCreating}
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
