import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type CameraPictureOptions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFoodLabels } from '@/components/meal/useFoodLabels';
import { useDayLabels } from '@/components/today/useDayLabels';
import { AppHeader, Button, Card, IconButton, Screen, Txt } from '@/components/ui';
import { currentSlot, todayKey } from '@/domain/date';
import { MEAL_SLOTS } from '@/domain/totals';
import { setPendingPhotoMeal } from '@/state/pendingMeal';
import { darkPalette, radius, spacing, useTheme } from '@/theme';
import type { MealSlot } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Capture settings: quality is halved and EXIF dropped so the base64 payload the
 * review screen forwards to the vision model stays a few hundred kilobytes.
 * Processing stays on, otherwise the saved photo comes back rotated on Android.
 */
const CAPTURE_OPTIONS: CameraPictureOptions = {
  quality: 0.6,
  base64: true,
  exif: false,
  skipProcessing: false,
};

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.6,
  base64: true,
  exif: false,
};

/** The camera chrome sits on top of a live photo, so it is dark in either theme. */
const CHROME = {
  text: darkPalette.text,
  muted: darkPalette.textMuted,
  danger: darkPalette.danger,
  scrim: darkPalette.overlay,
};

/** Decoration only: the surrounding control already carries the label. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readSlot(value: string | string[] | undefined): MealSlot {
  const candidate = firstParam(value);
  return MEAL_SLOTS.find((slot) => slot === candidate) ?? currentSlot();
}

function readDate(value: string | string[] | undefined): string {
  const candidate = firstParam(value);
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : todayKey();
}

export default function CameraScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slot?: string; date?: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation(['meals', 'common']);
  const labels = useFoodLabels();
  const dayLabels = useDayLabels();
  const insets = useSafeAreaInsets();

  const slot = readSlot(params.slot);
  const date = readDate(params.date);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const askedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const [mountFailed, setMountFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Browsers have no CameraView preview worth showing here, and a failed mount
  // (simulator, no hardware, camera held by another app) has to degrade too.
  const previewUnavailable = Platform.OS === 'web' || mountFailed;

  useEffect(() => {
    if (previewUnavailable || askedRef.current) return;
    if (!permission || permission.granted || !permission.canAskAgain) return;
    askedRef.current = true;
    void requestPermission();
  }, [permission, requestPermission, previewUnavailable]);

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const handoff = useCallback(
    (photoUri: string, base64: string | undefined, mimeType: string | undefined) => {
      setPendingPhotoMeal({ photoUri, base64, mimeType: mimeType ?? 'image/jpeg' });
      router.replace({ pathname: '/meal/review', params: { slot, date } });
    },
    [router, slot, date],
  );

  const capture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || busy || !ready) return;

    setBusy(true);
    setError(null);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    }

    try {
      const photo = await camera.takePictureAsync(CAPTURE_OPTIONS);
      if (!photo?.uri) {
        setError(t('meals:cameraErrorEmpty'));
        setBusy(false);
        return;
      }
      setTorch(false);
      handoff(photo.uri, photo.base64 ?? undefined, `image/${photo.format === 'png' ? 'png' : 'jpeg'}`);
    } catch {
      setError(t('meals:cameraErrorCapture'));
      setBusy(false);
    }
  }, [busy, ready, handoff, t]);

  const pickFromLibrary = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      if (result.canceled || result.assets.length === 0) {
        setBusy(false);
        return;
      }
      const asset = result.assets[0];
      setTorch(false);
      handoff(asset.uri, asset.base64 ?? undefined, asset.mimeType);
    } catch {
      setError(t('meals:cameraErrorPick'));
      setBusy(false);
    }
  }, [busy, handoff, t]);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {
      setError(t('meals:cameraErrorSettings', { app: t('common:appName') }));
    });
  }, [t]);

  /* ------------------------------------------------- picker-only fallback -- */

  if (previewUnavailable || (permission && !permission.granted)) {
    const denied = !previewUnavailable;
    const title = denied
      ? t('meals:cameraBlockedTitle')
      : t('meals:cameraNoPreviewTitle');
    const message = denied
      ? permission?.canAskAgain
        ? t('meals:cameraBlockedAsk', { app: t('common:appName') })
        : t('meals:cameraBlockedSettings', { app: t('common:appName') })
      : Platform.OS === 'web'
        ? t('meals:cameraNoPreviewWeb')
        : t('meals:cameraNoPreviewDevice');

    return (
      <Screen scroll edges={['top', 'bottom']} keyboardAvoiding={false}>
        <AppHeader
          title={t('meals:cameraTitle')}
          subtitle={`${labels.slot(slot)} · ${dayLabels.day(date)}`}
          onBack={leave}
        />

        <Card style={styles.fallbackCard}>
          <View
            style={[styles.fallbackIcon, { backgroundColor: colors.surfaceAlt }]}
            {...DECORATIVE}
          >
            <Ionicons
              name={(denied ? 'lock-closed-outline' : 'images-outline') as IconName}
              size={24}
              color={colors.accent}
            />
          </View>
          <Txt variant="heading" style={styles.fallbackTitle}>
            {title}
          </Txt>
          <Txt color="muted" style={styles.fallbackMessage}>
            {message}
          </Txt>

          <View style={styles.fallbackActions}>
            <Button
              label={t('meals:cameraLibrary')}
              icon="images-outline"
              onPress={() => void pickFromLibrary()}
              loading={busy}
              fullWidth
            />
            {denied && permission?.canAskAgain ? (
              <Button
                label={t('meals:cameraAllow')}
                icon="camera-outline"
                variant="secondary"
                onPress={() => void requestPermission()}
                fullWidth
              />
            ) : null}
            {denied && !permission?.canAskAgain && Platform.OS !== 'web' ? (
              <Button
                label={t('meals:openSettings')}
                icon="settings-outline"
                variant="secondary"
                onPress={openSettings}
                fullWidth
              />
            ) : null}
            {mountFailed ? (
              <Button
                label={t('meals:cameraRetry')}
                icon="refresh-outline"
                variant="ghost"
                onPress={() => {
                  setMountFailed(false);
                  setReady(false);
                  setError(null);
                }}
                fullWidth
              />
            ) : null}
          </View>

          {error ? (
            <Txt variant="label" color="danger" style={styles.fallbackError}>
              {error}
            </Txt>
          ) : (
            <Txt variant="caption" color="faint" align="center" style={styles.fallbackError}>
              {t('meals:cameraReviewNote')}
            </Txt>
          )}
        </Card>
      </Screen>
    );
  }

  /* ------------------------------------------------------- live preview -- */

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {permission?.granted ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="picture"
          mute
          enableTorch={torch}
          animateShutter={false}
          onCameraReady={() => setReady(true)}
          onMountError={() => {
            setReady(false);
            setMountFailed(true);
          }}
        />
      ) : null}

      <View
        style={[
          styles.topBar,
          { backgroundColor: CHROME.scrim, paddingTop: insets.top + spacing.sm },
        ]}
      >
        <IconButton
          icon="close"
          accessibilityLabel={t('meals:cameraClose')}
          onPress={leave}
          color={CHROME.text}
        />
        <View
          style={styles.topText}
          accessible
          accessibilityLabel={t('meals:cameraTopSpoken', {
            slot: labels.slot(slot),
            day: dayLabels.day(date),
            hint: t('meals:cameraFrameHint'),
          })}
        >
          <Txt weight="semibold" color={CHROME.text} align="center" numberOfLines={1}>
            {`${labels.slot(slot)} · ${dayLabels.day(date)}`}
          </Txt>
          <Txt variant="caption" color={CHROME.muted} align="center" numberOfLines={1}>
            {t('meals:cameraFrameHint')}
          </Txt>
        </View>
        {Platform.OS === 'web' ? (
          <View style={styles.topSpacer} />
        ) : (
          <IconButton
            icon={torch ? 'flashlight' : 'flashlight-outline'}
            accessibilityLabel={torch ? t('meals:cameraTorchOff') : t('meals:cameraTorchOn')}
            onPress={() => setTorch((on) => !on)}
            color={torch ? darkPalette.warning : CHROME.text}
          />
        )}
      </View>

      <View
        style={[
          styles.bottomBar,
          { backgroundColor: CHROME.scrim, paddingBottom: insets.bottom + spacing.lg },
        ]}
      >
        {error ? (
          <Txt variant="label" color={CHROME.danger} align="center" style={styles.bottomError}>
            {error}
          </Txt>
        ) : null}

        <View style={styles.bottomRow}>
          <Pressable
            onPress={() => void pickFromLibrary()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('meals:cameraLibrary')}
            accessibilityState={{ disabled: busy }}
            style={({ pressed }) => [styles.sideAction, pressed ? styles.pressed : null]}
          >
            <Ionicons name="images-outline" size={22} color={CHROME.text} {...DECORATIVE} />
            <Txt variant="caption" color={CHROME.muted} align="center">
              {t('meals:cameraLibraryShort')}
            </Txt>
          </Pressable>

          <Pressable
            onPress={() => void capture()}
            disabled={busy || !ready}
            accessibilityRole="button"
            accessibilityLabel={t('meals:cameraShutter')}
            accessibilityState={{ disabled: busy || !ready, busy }}
            style={({ pressed }) => [
              styles.shutter,
              { borderColor: CHROME.text },
              pressed ? styles.pressed : null,
              busy || !ready ? styles.shutterIdle : null,
            ]}
          >
            <View style={[styles.shutterCore, { backgroundColor: CHROME.text }]} {...DECORATIVE} />
          </Pressable>

          <View style={styles.sideAction} />
        </View>

        <Txt variant="caption" color={CHROME.muted} align="center" style={styles.hint}>
          {ready ? t('meals:cameraReviewNote') : `${t('meals:cameraStarting')}…`}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  topText: {
    flex: 1,
  },
  topSpacer: {
    height: 44,
    width: 44,
  },
  bottomBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    rowGap: spacing.md,
  },
  bottomRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bottomError: {
    paddingHorizontal: spacing.sm,
  },
  sideAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 64,
    rowGap: 2,
  },
  shutter: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 4,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  shutterIdle: {
    opacity: 0.45,
  },
  shutterCore: {
    borderRadius: radius.pill,
    height: 58,
    width: 58,
  },
  pressed: {
    opacity: 0.6,
  },
  hint: {
    paddingHorizontal: spacing.lg,
  },
  fallbackCard: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  fallbackIcon: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  fallbackTitle: {
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  fallbackMessage: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  fallbackActions: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
    rowGap: spacing.sm,
  },
  fallbackError: {
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
