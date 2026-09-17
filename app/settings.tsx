import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  View,
  type ViewProps,
} from 'react-native';

import {
  AppHeader,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  IconButton,
  ListRow,
  Screen,
  SegmentedControl,
  TextField,
  Txt,
  type SegmentedOption,
} from '@/components/ui';
import { formatCount } from '@/domain/format';
import {
  LANGUAGES,
  changeLanguage,
  currentLanguage,
  setNativeDirection,
  type LanguageCode,
} from '@/i18n';
import { useApp } from '@/state/AppStore';
import { DEFAULT_SETTINGS, deleteCustomFood, exportAll } from '@/storage/repository';
import { clearApiKey, hasApiKey, setApiKey } from '@/storage/secrets';
import { radius, spacing, useTheme } from '@/theme';
import type { FoodItem, PhotoAnalysisMode, UnitSystem } from '@/types';

/**
 * Decorative nodes are hidden from assistive tech with the prop the platform
 * understands: the native pair is not valid on a DOM element.
 */
const DECORATIVE: Pick<
  ViewProps,
  'aria-hidden' | 'accessibilityElementsHidden' | 'importantForAccessibility'
> =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

/** Shown in place of a stored key. The real value is never rendered back. */
const KEY_MASK = '••••••••••••••••••••••••';

const HTTP_URL = /^https?:\/\/\S+$/i;

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}

/** Alert is a no-op on react-native-web, so the browser gets its own dialog. */
function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: ConfirmOptions): void {
  if (Platform.OS === 'web') {
    const canAsk = typeof window !== 'undefined' && typeof window.confirm === 'function';
    if (!canAsk || window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

interface AppIdentity {
  name: string;
  /** Null when the running manifest does not carry a version. */
  version: string | null;
}

function readableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The manifest shape differs between Expo Go, a dev build and a store build, so
 * every field is read as unknown and falls back rather than throwing.
 */
function readAppIdentity(): AppIdentity {
  try {
    const config = Constants.expoConfig;
    return {
      name: readableString(config?.name) ?? 'Nutrition',
      version: readableString(config?.version),
    };
  } catch {
    return { name: 'Nutrition', version: null };
  }
}

function SectionTitle({
  title,
  hint,
  first = false,
}: {
  title: string;
  hint?: string;
  /** Tightens the gap when the section sits directly under the header. */
  first?: boolean;
}) {
  return (
    <View style={[styles.sectionTitle, first ? styles.sectionTitleFirst : null]}>
      <Txt
        variant="caption"
        color="faint"
        weight="semibold"
        accessibilityRole="header"
        style={styles.sectionLabel}
      >
        {title.toUpperCase()}
      </Txt>
      {hint ? (
        <Txt variant="label" color="muted" style={styles.sectionHint}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

/** Heading for a card that sits inside a section, one step down from it. */
function CardTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.cardTitle}>
      <Txt weight="semibold">{title}</Txt>
      {hint ? (
        <Txt variant="label" color="muted" style={styles.cardHint}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

function ModeLine({
  label,
  description,
  active,
}: {
  label: string;
  description: string;
  active: boolean;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.modeLine}>
      <View
        style={[styles.modeDot, { backgroundColor: active ? colors.accent : colors.border }]}
        {...DECORATIVE}
      />
      <View style={styles.modeText}>
        <Txt variant="label" weight="semibold" color={active ? 'text' : 'muted'}>
          {label}
        </Txt>
        <Txt variant="label" color="muted" style={styles.modeDescription}>
          {description}
        </Txt>
      </View>
    </View>
  );
}

function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value }}
      style={({ pressed }) => [
        styles.switchRow,
        pressed ? { backgroundColor: colors.surfaceAlt } : null,
      ]}
    >
      <View style={styles.switchText}>
        <Txt weight="medium">{title}</Txt>
        <Txt variant="label" color="muted" style={styles.switchSubtitle}>
          {subtitle}
        </Txt>
      </View>
      {/* The row owns the gesture and the label; the switch is only the picture. */}
      <View pointerEvents="none" {...DECORATIVE}>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.track, true: colors.accent }}
          thumbColor={Platform.OS === 'android' ? colors.surface : undefined}
          ios_backgroundColor={colors.track}
        />
      </View>
    </Pressable>
  );
}

/** The language names stay in their own script, never translated. */
const LANGUAGE_OPTIONS: SegmentedOption<LanguageCode>[] = LANGUAGES.map((entry) => ({
  value: entry.code,
  label: entry.label,
}));

/** Language, units, photo analysis, saved foods, export and erase. */
export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation(['settings', 'common']);
  const { profile, settings, customFoods, updateProfile, updateSettings, refresh, resetAll } =
    useApp();

  const identity = useMemo(readAppIdentity, []);

  const [keyChecked, setKeyChecked] = useState(false);
  const [keyStored, setKeyStored] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyNotice, setKeyNotice] = useState<string | null>(null);

  const [modelDraft, setModelDraft] = useState(settings.aiModel);
  const [modelFocused, setModelFocused] = useState(false);
  const [baseUrlDraft, setBaseUrlDraft] = useState(settings.aiBaseUrl);
  const [baseUrlFocused, setBaseUrlFocused] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportJson, setExportJson] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  const modeOptions: SegmentedOption<PhotoAnalysisMode>[] = useMemo(
    () => [
      { value: 'manual', label: t('modeManual'), icon: 'create-outline' },
      { value: 'ai', label: t('modeAi'), icon: 'sparkles-outline' },
    ],
    [t],
  );

  const unitOptions: SegmentedOption<UnitSystem>[] = useMemo(
    () => [
      { value: 'metric', label: t('unitMetric') },
      { value: 'imperial', label: t('unitImperial') },
    ],
    [t],
  );

  // Ask the keychain once. The value itself is never held in component state.
  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await hasApiKey();
      if (!active) return;
      setKeyStored(stored);
      setKeyChecked(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Mirror the stored value, but never while the field is being typed into.
  useEffect(() => {
    if (!modelFocused) setModelDraft(settings.aiModel);
  }, [settings.aiModel, modelFocused]);

  useEffect(() => {
    if (!baseUrlFocused) setBaseUrlDraft(settings.aiBaseUrl);
  }, [settings.aiBaseUrl, baseUrlFocused]);

  const trimmedModel = modelDraft.trim();
  const modelError = trimmedModel.length === 0 ? t('modelError') : undefined;

  const trimmedBaseUrl = baseUrlDraft.trim();
  const baseUrlError =
    trimmedBaseUrl.length === 0
      ? t('baseUrlEmpty')
      : HTTP_URL.test(trimmedBaseUrl)
        ? undefined
        : t('baseUrlInvalid');

  const changeModel = (text: string) => {
    setModelDraft(text);
    const next = text.trim();
    if (next.length > 0 && next !== settings.aiModel) void updateSettings({ aiModel: next });
  };

  const changeBaseUrl = (text: string) => {
    setBaseUrlDraft(text);
    const next = text.trim();
    if (HTTP_URL.test(next) && next !== settings.aiBaseUrl) {
      void updateSettings({ aiBaseUrl: next });
    }
  };

  const resetModel = () => {
    setModelDraft(DEFAULT_SETTINGS.aiModel);
    void updateSettings({ aiModel: DEFAULT_SETTINGS.aiModel });
  };

  const resetBaseUrl = () => {
    setBaseUrlDraft(DEFAULT_SETTINGS.aiBaseUrl);
    void updateSettings({ aiBaseUrl: DEFAULT_SETTINGS.aiBaseUrl });
  };

  const startReplacingKey = () => {
    setEditingKey(true);
    setKeyDraft('');
    setKeyNotice(null);
  };

  const cancelKeyEdit = () => {
    setEditingKey(false);
    setKeyDraft('');
  };

  const saveKey = useCallback(async () => {
    const value = keyDraft.trim();
    if (value.length === 0) return;
    setSavingKey(true);
    try {
      await setApiKey(value);
      const stored = await hasApiKey();
      setKeyStored(stored);
      setKeyDraft('');
      setEditingKey(false);
      setKeyNotice(stored ? t('keySavedNotice') : t('keyRefusedNotice'));
    } finally {
      setSavingKey(false);
    }
  }, [keyDraft, t]);

  const removeKey = () => {
    confirmAction({
      title: t('keyRemoveTitle'),
      message: t('keyRemoveMessage'),
      confirmLabel: t('common:remove'),
      cancelLabel: t('common:cancel'),
      onConfirm: () => {
        void (async () => {
          await clearApiKey();
          setKeyStored(false);
          setKeyDraft('');
          setEditingKey(false);
          setKeyNotice(t('keyRemovedNotice'));
        })();
      },
    });
  };

  const removeFood = (food: FoodItem) => {
    confirmAction({
      title: t('foodDeleteTitle', { name: food.name }),
      message: t('foodDeleteMessage'),
      confirmLabel: t('common:delete'),
      cancelLabel: t('common:cancel'),
      onConfirm: () => {
        void (async () => {
          try {
            setDataError(null);
            await deleteCustomFood(food.id);
            await refresh();
          } catch (error) {
            console.warn('[settings] could not delete custom food', error);
            setDataError(t('foodDeleteError', { name: food.name }));
          }
        })();
      },
    });
  };

  const handleExport = useCallback(async () => {
    setExporting(true);
    setDataError(null);
    try {
      const bundle = await exportAll();
      const json = JSON.stringify(bundle, null, 2);
      if (Platform.OS === 'web') {
        setExportJson(json);
        return;
      }
      await Share.share({ title: t('exportShareTitle', { app: identity.name }), message: json });
    } catch (error) {
      console.warn('[settings] export failed', error);
      setDataError(t('exportError'));
    } finally {
      setExporting(false);
    }
  }, [identity.name, t]);

  const eraseEverything = useCallback(async () => {
    try {
      await clearApiKey();
      await resetAll();
      setKeyStored(false);
      setKeyDraft('');
      setEditingKey(false);
      setKeyNotice(null);
      router.replace('/');
    } catch (error) {
      console.warn('[settings] erase failed', error);
      setDataError(t('eraseError'));
    }
  }, [resetAll, router, t]);

  const confirmErase = () => {
    confirmAction({
      title: t('eraseConfirmTitle'),
      message: t('eraseConfirmMessage'),
      confirmLabel: t('eraseConfirmAction'),
      cancelLabel: t('common:cancel'),
      onConfirm: () =>
        confirmAction({
          title: t('eraseLastTitle'),
          message: t('eraseLastMessage'),
          confirmLabel: t('eraseLastAction'),
          cancelLabel: t('common:cancel'),
          onConfirm: () => {
            void eraseEverything();
          },
        }),
    });
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/profile');
  };

  const [language, setLanguage] = useState<LanguageCode>(() => currentLanguage());

  const applyLanguage = useCallback(
    (next: LanguageCode) => {
      setLanguage(next);
      void (async () => {
        await changeLanguage(next);
        // Native layout direction only follows after a restart; say so rather
        // than leaving a half-mirrored screen behind. On the web the direction
        // is applied live, and setNativeDirection reports no restart is needed.
        if (setNativeDirection(next)) {
          Alert.alert(t('restartTitle'), t('restartMessage'));
        }
      })();
    },
    [t],
  );

  const units: UnitSystem = profile?.units ?? 'metric';
  const aiOn = settings.photoAnalysis === 'ai';
  const showKeyField = !keyStored || editingKey;
  const foodCount = customFoods.length;

  const foodSubtitle = (food: FoodItem): string => {
    const energy = t(food.liquid ? 'foodEnergyPer100ml' : 'foodEnergyPer100g', {
      value: formatCount(food.per100.calories),
    });
    return food.brand ? `${food.brand} · ${energy}` : energy;
  };

  return (
    <>
      <Screen scroll keyboardAvoiding edges={['top', 'bottom']}>
        <AppHeader title={t('title')} subtitle={t('subtitle')} onBack={goBack} />

        {/* ---------------------------------------------------- language -- */}
        <SectionTitle first title={t('languageTitle')} hint={t('languageHint')} />
        <Card style={styles.firstCard}>
          <SegmentedControl<LanguageCode>
            options={LANGUAGE_OPTIONS}
            value={language}
            onChange={applyLanguage}
          />
          <Txt variant="label" color="muted" style={styles.paragraph}>
            {Platform.OS === 'web' ? t('languageNoteWeb') : t('languageNoteNative')}
          </Txt>
        </Card>

        {/* ------------------------------------------------------- units -- */}
        <SectionTitle title={t('unitsTitle')} hint={t('unitsHint')} />
        <Card style={styles.firstCard}>
          <View
            pointerEvents={profile ? 'auto' : 'none'}
            style={profile ? undefined : styles.disabled}
          >
            <SegmentedControl<UnitSystem>
              options={unitOptions}
              value={units}
              onChange={(next) => void updateProfile({ units: next })}
            />
          </View>
          {profile ? null : (
            <>
              <Txt variant="label" color="muted" style={styles.paragraph}>
                {t('unitsLocked')}
              </Txt>
              <Button
                label={t('setupProfile')}
                onPress={() => router.push('/onboarding')}
                variant="secondary"
                icon="person-add-outline"
                style={styles.resetButton}
              />
            </>
          )}
        </Card>

        {/* -------------------------------------------------- photo mode -- */}
        <SectionTitle title={t('photoTitle')} hint={t('photoHint')} />
        <Card style={styles.firstCard}>
          <SegmentedControl<PhotoAnalysisMode>
            options={modeOptions}
            value={settings.photoAnalysis}
            onChange={(next) => void updateSettings({ photoAnalysis: next })}
          />

          <View style={styles.modeList}>
            <ModeLine label={t('modeManual')} description={t('modeManualDesc')} active={!aiOn} />
            <ModeLine label={t('modeAi')} description={t('modeAiDesc')} active={aiOn} />
          </View>
        </Card>

        {aiOn ? (
          <>
            {/* The cost of the choice comes before the fields that serve it. */}
            <Card style={[styles.card, styles.warningCard, { borderColor: colors.warning }]}>
              <View style={styles.warningHead}>
                <Ionicons
                  name="warning-outline"
                  size={18}
                  color={colors.warning}
                  {...DECORATIVE}
                />
                <Txt weight="semibold" color="warning" style={styles.warningTitle}>
                  {t('warningTitle')}
                </Txt>
              </View>
              <Txt style={styles.warningBody}>{t('warningUpload')}</Txt>
              <Txt style={styles.warningBody}>{t('warningKey')}</Txt>
            </Card>

            <Card style={styles.card}>
              <CardTitle title={t('keyTitle')} hint={t('keyHint')} />

              {keyChecked ? null : (
                <Txt variant="label" color="muted">
                  {t('keyChecking')}
                </Txt>
              )}

              {keyChecked && keyStored ? (
                <View style={styles.keyStored}>
                  <View style={styles.keyHead}>
                    <Txt variant="label" color="muted" weight="medium">
                      {t('keyStored')}
                    </Txt>
                    <Badge label={t('keySavedBadge')} tone="accent" />
                  </View>
                  <View
                    style={[
                      styles.mask,
                      { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                    ]}
                  >
                    <Txt color="muted" numberOfLines={1} accessibilityLabel={t('keyMaskSpoken')}>
                      {KEY_MASK}
                    </Txt>
                  </View>
                  <View style={styles.actionRow}>
                    <Button
                      label={t('keyReplace')}
                      onPress={startReplacingKey}
                      variant="secondary"
                      icon="key-outline"
                    />
                    <Button
                      label={t('keyRemove')}
                      onPress={removeKey}
                      variant="danger"
                      icon="trash-outline"
                      accessibilityHint={t('keyRemoveHint')}
                    />
                  </View>
                </View>
              ) : null}

              {keyChecked && showKeyField ? (
                <View style={keyStored ? styles.keyEditor : undefined}>
                  <TextField
                    label={keyStored ? t('keyLabelNew') : t('keyLabel')}
                    value={keyDraft}
                    onChangeText={(text) => {
                      setKeyDraft(text);
                      setKeyNotice(null);
                    }}
                    placeholder="sk-ant-..."
                    secureTextEntry
                    autoCapitalize="none"
                    icon="key-outline"
                    hint={t('keyFieldHint')}
                    returnKeyType="done"
                    onSubmitEditing={() => void saveKey()}
                  />
                  <View style={styles.actionRow}>
                    <Button
                      label={t('keySave')}
                      onPress={() => void saveKey()}
                      disabled={keyDraft.trim().length === 0}
                      loading={savingKey}
                      icon="checkmark-outline"
                    />
                    {keyStored ? (
                      <Button label={t('common:cancel')} onPress={cancelKeyEdit} variant="ghost" />
                    ) : null}
                  </View>
                </View>
              ) : null}

              {keyNotice ? (
                <Txt variant="label" color="muted" style={styles.notice}>
                  {keyNotice}
                </Txt>
              ) : null}
            </Card>

            <Card padded={false} style={styles.card}>
              <SwitchRow
                title={t('askTitle')}
                subtitle={t('askSubtitle')}
                value={settings.confirmBeforeUpload}
                onValueChange={(next) => void updateSettings({ confirmBeforeUpload: next })}
              />
            </Card>

            <Card style={styles.card}>
              <CardTitle title={t('endpointTitle')} hint={t('endpointHint')} />

              <TextField
                label={t('model')}
                value={modelDraft}
                onChangeText={changeModel}
                onFocus={() => setModelFocused(true)}
                onBlur={() => setModelFocused(false)}
                autoCapitalize="none"
                placeholder={DEFAULT_SETTINGS.aiModel}
                error={modelError}
                hint={t('modelHint')}
                icon="cube-outline"
              />
              {settings.aiModel === DEFAULT_SETTINGS.aiModel ? null : (
                <Button
                  label={t('modelReset')}
                  onPress={resetModel}
                  variant="secondary"
                  size="sm"
                  icon="refresh-outline"
                  style={styles.resetButton}
                />
              )}

              <TextField
                label={t('baseUrl')}
                value={baseUrlDraft}
                onChangeText={changeBaseUrl}
                onFocus={() => setBaseUrlFocused(true)}
                onBlur={() => setBaseUrlFocused(false)}
                autoCapitalize="none"
                keyboardType="url"
                placeholder={DEFAULT_SETTINGS.aiBaseUrl}
                error={baseUrlError}
                hint={t('baseUrlHint')}
                icon="globe-outline"
                style={styles.field}
              />
              {settings.aiBaseUrl === DEFAULT_SETTINGS.aiBaseUrl ? null : (
                <Button
                  label={t('baseUrlReset')}
                  onPress={resetBaseUrl}
                  variant="secondary"
                  size="sm"
                  icon="refresh-outline"
                  style={styles.resetButton}
                />
              )}
            </Card>
          </>
        ) : null}

        {/* ------------------------------------------------------- foods -- */}
        <SectionTitle
          title={t('foodsTitle')}
          hint={
            foodCount === 1
              ? t('foodsCountOne')
              : t('foodsCount', { value: formatCount(foodCount) })
          }
        />
        {foodCount === 0 ? (
          <Card padded={false} style={styles.firstCard}>
            <EmptyState
              icon="nutrition-outline"
              title={t('foodsEmptyTitle')}
              message={t('foodsEmptyMessage')}
            />
          </Card>
        ) : (
          <Card padded={false} style={styles.firstCard}>
            {customFoods.map((food, index) => (
              <View key={food.id}>
                {index > 0 ? <Divider inset /> : null}
                {/* Row and delete button are siblings: never a button inside a button. */}
                <View style={styles.foodRow}>
                  <ListRow
                    title={food.name}
                    subtitle={foodSubtitle(food)}
                    icon="pricetag-outline"
                    style={styles.foodRowMain}
                  />
                  <IconButton
                    icon="trash-outline"
                    variant="danger"
                    size={18}
                    onPress={() => removeFood(food)}
                    accessibilityLabel={t('foodDelete', { name: food.name })}
                  />
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* -------------------------------------------------------- data -- */}
        <SectionTitle title={t('dataTitle')} hint={t('dataHint')} />
        <Card style={styles.firstCard}>
          <CardTitle
            title={t('exportTitle')}
            hint={Platform.OS === 'web' ? t('exportHintWeb') : t('exportHintNative')}
          />
          <Button
            label={t('exportTitle')}
            onPress={() => void handleExport()}
            loading={exporting}
            variant="secondary"
            icon="share-outline"
          />
        </Card>

        <Card style={[styles.card, styles.warningCard, { borderColor: colors.danger }]}>
          <Txt weight="semibold" color="danger">
            {t('eraseTitle')}
          </Txt>
          <Txt variant="label" color="muted" style={styles.paragraph}>
            {t('eraseBody')}
          </Txt>
          <Button
            label={t('eraseTitle')}
            onPress={confirmErase}
            variant="danger"
            icon="trash-outline"
            accessibilityHint={t('eraseHint')}
            style={styles.resetButton}
          />
        </Card>

        {dataError ? (
          <Txt variant="label" color="danger" style={styles.notice}>
            {dataError}
          </Txt>
        ) : null}

        {/* ------------------------------------------------------- about -- */}
        <SectionTitle title={t('aboutTitle')} />
        <Card style={[styles.firstCard, styles.lastCard]}>
          <View style={styles.aboutHead}>
            <Txt weight="semibold">{identity.name}</Txt>
            <Badge
              label={
                identity.version === null
                  ? t('devBuild')
                  : t('version', { version: identity.version })
              }
              tone="default"
            />
          </View>
          <Txt variant="label" color="muted" style={styles.paragraph}>
            {t('aboutBody')}
          </Txt>
        </Card>
      </Screen>

      <Modal
        visible={exportJson !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setExportJson(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
            onPress={() => setExportJson(null)}
            accessibilityRole="button"
            accessibilityLabel={t('exportSheetClose')}
          />
          <View style={styles.modalCenter} pointerEvents="box-none">
            <View
              style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Txt variant="heading">{t('exportSheetTitle')}</Txt>
              <Txt variant="label" color="muted" style={styles.sheetHint}>
                {t('exportSheetHint')}
              </Txt>

              <ScrollView
                style={[styles.exportBox, { backgroundColor: colors.bg, borderColor: colors.border }]}
                contentContainerStyle={styles.exportContent}
              >
                {/* JSON is machine text: it stays left to right in both languages. */}
                <Txt
                  variant="caption"
                  color="muted"
                  align="left"
                  selectable
                  style={styles.exportText}
                >
                  {exportJson ?? ''}
                </Txt>
              </ScrollView>

              <View style={styles.sheetActions}>
                <Button label={t('common:done')} onPress={() => setExportJson(null)} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginBottom: spacing.sm,
    marginTop: spacing.xxl,
  },
  sectionTitleFirst: {
    marginTop: spacing.sm,
  },
  sectionLabel: {
    letterSpacing: 0.8,
  },
  sectionHint: {
    marginTop: 2,
  },
  firstCard: {
    marginTop: 0,
  },
  lastCard: {
    marginBottom: spacing.xl,
  },
  card: {
    marginTop: spacing.md,
  },
  cardTitle: {
    marginBottom: spacing.lg,
  },
  cardHint: {
    marginTop: spacing.xs,
  },
  field: {
    marginTop: spacing.lg,
  },
  paragraph: {
    marginTop: spacing.sm,
  },
  notice: {
    marginTop: spacing.md,
  },
  modeList: {
    marginTop: spacing.lg,
    rowGap: spacing.md,
  },
  modeLine: {
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  modeDot: {
    borderRadius: radius.pill,
    height: 8,
    marginTop: 5,
    width: 8,
  },
  modeText: {
    flex: 1,
  },
  modeDescription: {
    marginTop: 2,
  },
  keyStored: {
    rowGap: spacing.md,
  },
  keyHead: {
    alignItems: 'center',
    flexDirection: 'row',
    columnGap: spacing.sm,
    justifyContent: 'space-between',
  },
  mask: {
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  keyEditor: {
    marginTop: spacing.lg,
  },
  actionRow: {
    columnGap: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.lg,
    rowGap: spacing.sm,
  },
  resetButton: {
    marginTop: spacing.lg,
  },
  warningCard: {
    borderWidth: 1,
  },
  warningHead: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  warningTitle: {
    flexShrink: 1,
  },
  warningBody: {
    marginTop: spacing.sm,
  },
  switchRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  switchText: {
    flex: 1,
  },
  switchSubtitle: {
    marginTop: 2,
  },
  foodRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingEnd: spacing.sm,
  },
  foodRowMain: {
    flex: 1,
    paddingEnd: spacing.sm,
  },
  disabled: {
    opacity: 0.45,
  },
  aboutHead: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalRoot: {
    flex: 1,
  },
  modalCenter: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    alignSelf: 'center',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 520,
    padding: spacing.xl,
    width: '100%',
  },
  sheetHint: {
    marginTop: spacing.xs,
  },
  exportBox: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    maxHeight: 320,
  },
  exportContent: {
    padding: spacing.md,
  },
  exportText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    letterSpacing: 0,
    lineHeight: 17,
    writingDirection: 'ltr',
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
