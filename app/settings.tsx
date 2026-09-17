import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useApp } from '@/state/AppStore';
import { DEFAULT_SETTINGS, deleteCustomFood, exportAll } from '@/storage/repository';
import { clearApiKey, hasApiKey, setApiKey } from '@/storage/secrets';
import { radius, spacing, useTheme } from '@/theme';
import type { FoodItem, PhotoAnalysisMode, UnitSystem } from '@/types';

import { formatCount } from './onboarding/_layout';

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

const MODE_OPTIONS: SegmentedOption<PhotoAnalysisMode>[] = [
  { value: 'manual', label: 'Manual', icon: 'create-outline' },
  { value: 'ai', label: 'AI scan', icon: 'sparkles-outline' },
];

const UNIT_OPTIONS: SegmentedOption<UnitSystem>[] = [
  { value: 'metric', label: 'Metric · cm / kg' },
  { value: 'imperial', label: 'Imperial · ft / lb' },
];

/** Shown in place of a stored key. The real value is never rendered back. */
const KEY_MASK = '••••••••••••••••••••••••';

const HTTP_URL = /^https?:\/\/\S+$/i;

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/** Alert is a no-op on react-native-web, so the browser gets its own dialog. */
function confirmAction({ title, message, confirmLabel, onConfirm }: ConfirmOptions): void {
  if (Platform.OS === 'web') {
    const canAsk = typeof window !== 'undefined' && typeof window.confirm === 'function';
    if (!canAsk || window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
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

function foodSubtitle(food: FoodItem): string {
  const unit = food.liquid ? '100 ml' : '100 g';
  const energy = `${formatCount(food.per100.calories)} kcal per ${unit}`;
  return food.brand ? `${food.brand} · ${energy}` : energy;
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

/** Photo analysis, units, saved foods, export/erase and what the numbers mean. */
export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
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
  const modelError = trimmedModel.length === 0 ? 'Enter a model name.' : undefined;

  const trimmedBaseUrl = baseUrlDraft.trim();
  const baseUrlError =
    trimmedBaseUrl.length === 0
      ? 'Enter the address of the API.'
      : HTTP_URL.test(trimmedBaseUrl)
        ? undefined
        : 'Start with https:// so the app knows how to reach it.';

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
      setKeyNotice(
        stored
          ? 'Key saved on this device.'
          : 'This device refused to store the key, so photo analysis will ask for it again.',
      );
    } finally {
      setSavingKey(false);
    }
  }, [keyDraft]);

  const removeKey = () => {
    confirmAction({
      title: 'Remove API key?',
      message:
        'Photo analysis stops working until you enter a key again. Your meals and profile are untouched.',
      confirmLabel: 'Remove',
      onConfirm: () => {
        void (async () => {
          await clearApiKey();
          setKeyStored(false);
          setKeyDraft('');
          setEditingKey(false);
          setKeyNotice('Key removed from this device.');
        })();
      },
    });
  };

  const removeFood = (food: FoodItem) => {
    confirmAction({
      title: `Delete ${food.name}?`,
      message: 'Meals you already logged with it keep the numbers they were saved with.',
      confirmLabel: 'Delete',
      onConfirm: () => {
        void (async () => {
          try {
            setDataError(null);
            await deleteCustomFood(food.id);
            await refresh();
          } catch (error) {
            console.warn('[settings] could not delete custom food', error);
            setDataError(`Could not delete ${food.name}. Try again in a moment.`);
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
      await Share.share({ title: `${identity.name} data export`, message: json });
    } catch (error) {
      console.warn('[settings] export failed', error);
      setDataError('Could not build the export. Try again in a moment.');
    } finally {
      setExporting(false);
    }
  }, [identity.name]);

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
      setDataError('Could not erase your data. Try again in a moment.');
    }
  }, [resetAll, router]);

  const confirmErase = () => {
    confirmAction({
      title: 'Erase everything?',
      message:
        'This deletes your profile, every logged meal and its photo reference, your weight history, your custom foods, your settings and the stored API key.',
      confirmLabel: 'Continue',
      onConfirm: () =>
        confirmAction({
          title: 'Last chance',
          message:
            'There is no undo and nothing is backed up. Export your data first if you want a copy.',
          confirmLabel: 'Erase everything',
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

  const units: UnitSystem = profile?.units ?? 'metric';
  const aiOn = settings.photoAnalysis === 'ai';
  const showKeyField = !keyStored || editingKey;
  const foodCount = customFoods.length;

  return (
    <>
      <Screen scroll keyboardAvoiding edges={['top', 'bottom']}>
        <AppHeader
          title="Settings"
          subtitle="Photo analysis, units, your data"
          onBack={goBack}
        />

        {/* -------------------------------------------------- photo mode -- */}
        <SectionTitle
          first
          title="Photo analysis"
          hint="What happens to a meal photo after you take it."
        />
        <Card style={styles.firstCard}>
          <SegmentedControl<PhotoAnalysisMode>
            options={MODE_OPTIONS}
            value={settings.photoAnalysis}
            onChange={(next) => void updateSettings({ photoAnalysis: next })}
          />

          <View style={styles.modeList}>
            <ModeLine
              label="Manual"
              description="The photo is only attached to the meal, and you type what you ate."
              active={!aiOn}
            />
            <ModeLine
              label="AI scan"
              description="The photo is uploaded to the API below, which names the foods and estimates portions for you."
              active={aiOn}
            />
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
                <Txt weight="semibold" color="warning">
                  What AI scanning costs you
                </Txt>
              </View>
              <Txt style={styles.warningBody}>
                Every photo you scan is uploaded to the API at the base URL below, together with
                your key, and is billed to your account.
              </Txt>
              <Txt style={styles.warningBody}>
                The key is held in this device&apos;s keychain; on the web build there is no
                keychain, so it sits in ordinary, unencrypted browser storage. Anyone who can unlock
                this device can open the app and spend against your key.
              </Txt>
            </Card>

            <Card style={styles.card}>
              <CardTitle title="API key" hint="Kept on this device and sent with every scan." />

              {keyChecked ? null : (
                <Txt variant="label" color="muted">
                  Checking this device for a saved key...
                </Txt>
              )}

              {keyChecked && keyStored ? (
                <View style={styles.keyStored}>
                  <View style={styles.keyHead}>
                    <Txt variant="label" color="muted" weight="medium">
                      Stored key
                    </Txt>
                    <Badge label="Saved" tone="accent" />
                  </View>
                  <View
                    style={[
                      styles.mask,
                      { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                    ]}
                  >
                    <Txt
                      color="muted"
                      numberOfLines={1}
                      accessibilityLabel="A key is saved on this device. It is hidden and is never shown again."
                    >
                      {KEY_MASK}
                    </Txt>
                  </View>
                  <View style={styles.actionRow}>
                    <Button
                      label="Replace"
                      onPress={startReplacingKey}
                      variant="secondary"
                      icon="key-outline"
                    />
                    <Button
                      label="Remove"
                      onPress={removeKey}
                      variant="danger"
                      icon="trash-outline"
                      accessibilityHint="Asks you to confirm before the key is deleted"
                    />
                  </View>
                </View>
              ) : null}

              {keyChecked && showKeyField ? (
                <View style={keyStored ? styles.keyEditor : undefined}>
                  <TextField
                    label={keyStored ? 'New API key' : 'API key'}
                    value={keyDraft}
                    onChangeText={(text) => {
                      setKeyDraft(text);
                      setKeyNotice(null);
                    }}
                    placeholder="sk-ant-..."
                    secureTextEntry
                    autoCapitalize="none"
                    icon="key-outline"
                    hint="Saved on this device only, and never shown again once it is stored."
                    returnKeyType="done"
                    onSubmitEditing={() => void saveKey()}
                  />
                  <View style={styles.actionRow}>
                    <Button
                      label="Save key"
                      onPress={() => void saveKey()}
                      disabled={keyDraft.trim().length === 0}
                      loading={savingKey}
                      icon="checkmark-outline"
                    />
                    {keyStored ? (
                      <Button label="Cancel" onPress={cancelKeyEdit} variant="ghost" />
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
                title="Ask before each upload"
                subtitle="Show a confirmation naming the API before a photo leaves the device."
                value={settings.confirmBeforeUpload}
                onValueChange={(next) => void updateSettings({ confirmBeforeUpload: next })}
              />
            </Card>

            <Card style={styles.card}>
              <CardTitle
                title="Endpoint"
                hint="The defaults work. Change these only if you know you need to."
              />

              <TextField
                label="Model"
                value={modelDraft}
                onChangeText={changeModel}
                onFocus={() => setModelFocused(true)}
                onBlur={() => setModelFocused(false)}
                autoCapitalize="none"
                placeholder={DEFAULT_SETTINGS.aiModel}
                error={modelError}
                hint="The vision model asked to read your plate."
                icon="cube-outline"
              />
              {settings.aiModel === DEFAULT_SETTINGS.aiModel ? null : (
                <Button
                  label="Reset model"
                  onPress={resetModel}
                  variant="secondary"
                  size="sm"
                  icon="refresh-outline"
                  style={styles.resetButton}
                />
              )}

              <TextField
                label="Base URL"
                value={baseUrlDraft}
                onChangeText={changeBaseUrl}
                onFocus={() => setBaseUrlFocused(true)}
                onBlur={() => setBaseUrlFocused(false)}
                autoCapitalize="none"
                keyboardType="url"
                placeholder={DEFAULT_SETTINGS.aiBaseUrl}
                error={baseUrlError}
                hint="Change this only if you route requests through your own proxy."
                icon="globe-outline"
                style={styles.field}
              />
              {settings.aiBaseUrl === DEFAULT_SETTINGS.aiBaseUrl ? null : (
                <Button
                  label="Reset base URL"
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

        {/* ------------------------------------------------------- units -- */}
        <SectionTitle title="Units" hint="How heights and weights are shown throughout the app." />
        <Card style={styles.firstCard}>
          <View
            pointerEvents={profile ? 'auto' : 'none'}
            style={profile ? undefined : styles.disabled}
          >
            <SegmentedControl<UnitSystem>
              options={UNIT_OPTIONS}
              value={units}
              onChange={(next) => void updateProfile({ units: next })}
            />
          </View>
          {profile ? null : (
            <>
              <Txt variant="label" color="muted" style={styles.paragraph}>
                Units belong to your profile, and you do not have one yet. Set up your body and
                goal first and this choice will unlock.
              </Txt>
              <Button
                label="Set up my profile"
                onPress={() => router.push('/onboarding')}
                variant="secondary"
                icon="person-add-outline"
                style={styles.resetButton}
              />
            </>
          )}
        </Card>

        {/* ------------------------------------------------------- foods -- */}
        <SectionTitle
          title="Your foods"
          hint={
            foodCount === 1
              ? '1 food you entered by hand.'
              : `${formatCount(foodCount)} foods you entered by hand.`
          }
        />
        {foodCount === 0 ? (
          <Card padded={false} style={styles.firstCard}>
            <EmptyState
              icon="nutrition-outline"
              title="No foods of your own"
              message="Anything you type in by hand while logging a meal is saved here, so the next plate takes one tap."
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
                    accessibilityLabel={`Delete ${food.name}`}
                  />
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* -------------------------------------------------------- data -- */}
        <SectionTitle title="Data" hint="Everything lives on this device and nowhere else." />
        <Card style={styles.firstCard}>
          <CardTitle
            title="Export my data"
            hint={
              Platform.OS === 'web'
                ? 'One JSON file holding your profile, settings, meals, weight logs and custom foods. Browsers have no system share sheet, so it opens in a window you can copy from.'
                : 'One JSON file holding your profile, settings, meals, weight logs and custom foods, handed to the share sheet.'
            }
          />
          <Button
            label="Export my data"
            onPress={() => void handleExport()}
            loading={exporting}
            variant="secondary"
            icon="share-outline"
          />
        </Card>

        <Card style={[styles.card, styles.warningCard, { borderColor: colors.danger }]}>
          <Txt weight="semibold" color="danger">
            Erase everything
          </Txt>
          <Txt variant="label" color="muted" style={styles.paragraph}>
            Deletes your profile, every logged meal and the photo reference on it, your weight
            history, your custom foods, your settings and the stored API key. Photos already in
            your camera roll are left alone.
          </Txt>
          <Button
            label="Erase everything"
            onPress={confirmErase}
            variant="danger"
            icon="trash-outline"
            accessibilityHint="Asks you to confirm twice before anything is deleted"
            style={styles.resetButton}
          />
        </Card>

        {dataError ? (
          <Txt variant="label" color="danger" style={styles.notice}>
            {dataError}
          </Txt>
        ) : null}

        {/* ------------------------------------------------------- about -- */}
        <SectionTitle title="About" />
        <Card style={[styles.firstCard, styles.lastCard]}>
          <View style={styles.aboutHead}>
            <Txt weight="semibold">{identity.name}</Txt>
            <Badge
              label={identity.version === null ? 'Dev build' : `v${identity.version}`}
              tone="default"
            />
          </View>
          <Txt variant="label" color="muted" style={styles.paragraph}>
            Calories, macros, BMI and your daily targets are estimates. They come from standard
            equations and public food composition data, so a real plate and a real body will always
            differ from the numbers here. This app is not medical advice: talk to a doctor or a
            registered dietitian before making a big change to how you eat.
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
            accessibilityLabel="Close the export window"
          />
          <View style={styles.modalCenter} pointerEvents="box-none">
            <View
              style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Txt variant="heading">Your data</Txt>
              <Txt variant="label" color="muted" style={styles.sheetHint}>
                The browser build cannot open a share sheet, so the export is printed here. Click
                inside the box, select all with Ctrl+A (Cmd+A on a Mac), copy it, and paste it into
                a file named nutrition-export.json.
              </Txt>

              <ScrollView
                style={[styles.exportBox, { backgroundColor: colors.bg, borderColor: colors.border }]}
                contentContainerStyle={styles.exportContent}
              >
                <Txt variant="caption" color="muted" selectable style={styles.exportText}>
                  {exportJson ?? ''}
                </Txt>
              </ScrollView>

              <View style={styles.sheetActions}>
                <Button label="Done" onPress={() => setExportJson(null)} />
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
    paddingRight: spacing.sm,
  },
  foodRowMain: {
    flex: 1,
    paddingRight: spacing.sm,
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
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
