import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTrainingText } from '@/components/training/useTrainingText';
import {
  AppHeader,
  Badge,
  Button,
  Chip,
  Divider,
  EmptyState,
  ListRow,
  Screen,
  Section,
  TextField,
  Txt,
} from '@/components/ui';
import { EQUIPMENT_KEYS, searchExercises } from '@/data/exercises';
import { makeId } from '@/domain/id';
import { SESSION_LABEL_KEYS } from '@/domain/training';
import { useApp } from '@/state/AppStore';
import { layout, spacing, useTheme } from '@/theme';
import type { Equipment, Exercise, SessionType } from '@/types';

const SEARCH_DEBOUNCE_MS = 120;
const RESULT_LIMIT = 40;
const NAME_MAX = 60;

/** Between two facts on one line. Punctuation, so it is the same in both languages. */
const SEPARATOR = ' · ';

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

/** One search hit: its name, then everything else on one quiet second line. */
function ResultRow({ exercise, custom, onPress }: ResultRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation('training');
  const text = useTrainingText();

  const name = text.name(exercise);
  const altName = text.altName(exercise);
  const meta = text.meta(exercise);
  const about = [altName, meta].filter((part): part is string => Boolean(part)).join(SEPARATOR);

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
      <View style={styles.resultTitle}>
        <Txt numberOfLines={1} style={styles.resultName}>
          {name}
        </Txt>
        {custom ? <Badge label={t('badgeCustom')} variant="plain" /> : null}
      </View>
      <Txt variant="label" color="faint" numberOfLines={1} style={styles.resultLine}>
        {about}
      </Txt>
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

        <Section title={t('groupDayType')} gap="tight">
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
        </Section>

        <Section title={t('groupEquipment')} gap="tight">
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
        </Section>

        <Section>
          {saveError ? (
            <Txt variant="label" color="danger" style={styles.saveError}>
              {saveError}
            </Txt>
          ) : null}

          <Button
            label={t('saveAndAdd')}
            onPress={() => void saveCustom()}
            loading={saving}
            size="lg"
            fullWidth
          />
        </Section>
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
        // Every other screen scrolls without a visible bar; this one is the
        // same page and should not grow a rail down its edge.
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        // The rule between two hits lines up with the names it separates,
        // rather than with the edge of the screen.
        ItemSeparatorComponent={() => <Divider style={styles.separator} />}
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
            <View style={styles.footer}>
              <Divider />
              <ListRow
                title={t('createExercise')}
                subtitle={
                  trimmedQuery ? t('createWithQuery', { query: trimmedQuery }) : t('createSubtitle')
                }
                onPress={startCreating}
                chevron
                style={styles.footerRow}
              />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    paddingHorizontal: layout.gutter,
  },
  filterStrip: {
    flexGrow: 0,
    marginTop: spacing.lg,
  },
  filters: {
    columnGap: spacing.sm,
    paddingHorizontal: layout.gutter,
  },
  list: {
    flex: 1,
    marginTop: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  separator: {
    marginEnd: layout.gutter,
    marginStart: layout.gutter,
    width: 'auto',
  },
  result: {
    justifyContent: 'center',
    minHeight: 64,
    paddingHorizontal: layout.gutter,
    paddingVertical: spacing.md,
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
    marginTop: 3,
  },
  empty: {
    paddingTop: spacing.xxl,
  },
  footer: {
    marginTop: spacing.xl,
  },
  footerRow: {
    paddingHorizontal: layout.gutter,
  },
  field: {
    marginTop: spacing.lg,
  },
  chipWrap: {
    columnGap: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
  },
  saveError: {
    marginBottom: spacing.md,
  },
});
